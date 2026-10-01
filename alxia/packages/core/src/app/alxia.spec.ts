import { describe, expect, expectTypeOf, test } from 'bun:test';
import { z } from 'zod';
import { HttpError } from '../errors/errors';
import { alxia, type RoutesOf } from './alxia';

const User = z.object({ id: z.number(), name: z.string() });
const NotFound = z.object({ error: z.literal('not_found') });

const users = new Map([[1, { id: 1, name: 'Ada', password: 'secret' }]]);

const app = alxia()
	.decorate({ users })
	.get(
		'/users/:id',
		{
			params: z.object({ id: z.coerce.number().int() }),
			query: z.object({ upper: z.enum(['yes', 'no']).optional() }),
			response: { 200: User, 404: NotFound },
		},
		({ params, query, users, reply }) => {
			expectTypeOf(params).toEqualTypeOf<{ id: number }>();
			const user = users.get(params.id);
			if (user === undefined) return reply(404, { error: 'not_found' });
			return reply(200, {
				...user,
				name: query.upper === 'yes' ? user.name.toUpperCase() : user.name,
			});
		},
	)
	.post(
		'/users',
		{
			body: z.object({ name: z.string().min(1) }),
			response: { 201: User },
		},
		({ body, reply, set }) => {
			set.headers.set('x-created', 'yes');
			return reply(201, { id: 2, name: body.name });
		},
	)
	.get('/health', ({ reply }) => reply(200, { ok: true }))
	.get('/files/*', ({ params, reply }) => reply(200, params['*']))
	.get('/boom', () => {
		throw new Error('boom');
	});

const call = (path: string, init?: RequestInit) =>
	app.fetch(new Request(`http://localhost${path}`, init));

describe('routing', () => {
	test('a declared route answers with its reply', async () => {
		const response = await call('/users/1');
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ id: 1, name: 'Ada' });
	});

	test('the reply is sent as its schema output: unknown keys never leave', async () => {
		const body = await (await call('/users/1')).json();
		expect(body).not.toHaveProperty('password');
	});

	test('a wildcard reads the rest of the path', async () => {
		const response = await call('/files/a/b.txt');
		expect(await response.text()).toBe('a/b.txt');
	});

	test('an unknown path is a 404, a known path by another method a 405', async () => {
		expect((await call('/nope')).status).toBe(404);
		const response = await call('/health', { method: 'DELETE' });
		expect(response.status).toBe(405);
		expect(response.headers.get('allow')).toBe('GET');
	});
});

describe('validation', () => {
	test('params, query and body are checked, every issue reported', async () => {
		const response = await call('/users/abc?upper=maybe');
		expect(response.status).toBe(400);
		const body = await response.json();
		expect(body.error).toBe('validation');
		expect(
			body.issues.map((issue: { target: string }) => issue.target),
		).toEqual(['params', 'query']);
	});

	test('a malformed JSON body is a 400', async () => {
		const response = await call('/users', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: '{',
		});
		expect(response.status).toBe(400);
		expect((await response.json()).issues[0].code).toBe('invalid_json');
	});

	test('a valid body reaches the handler, with the headers it set', async () => {
		const response = await call('/users', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ name: 'Grace' }),
		});
		expect(response.status).toBe(201);
		expect(response.headers.get('x-created')).toBe('yes');
		expect(await response.json()).toEqual({ id: 2, name: 'Grace' });
	});
});

describe('hooks', () => {
	const guarded = alxia()
		.get('/public', ({ reply }) => reply(200, 'open'))
		.derive(({ request, reply }) => {
			const token = request.headers.get('authorization');
			if (token !== 'Bearer ada') {
				return reply(401, { error: 'unauthenticated' as const });
			}
			return { user: 'ada' };
		})
		.get('/me', ({ user, reply }) => reply(200, { user }));

	test('a hook guards only the routes after it', async () => {
		const open = await guarded.fetch(new Request('http://localhost/public'));
		expect(open.status).toBe(200);
		const closed = await guarded.fetch(new Request('http://localhost/me'));
		expect(closed.status).toBe(401);
	});

	test('what a hook returns is in the context', async () => {
		const response = await guarded.fetch(
			new Request('http://localhost/me', {
				headers: { authorization: 'Bearer ada' },
			}),
		);
		expect(await response.json()).toEqual({ user: 'ada' });
	});

	test("a hook's reply is in the type of the routes after it", () => {
		type Me = RoutesOf<typeof guarded>['/me']['GET']['output'];
		type Public = RoutesOf<typeof guarded>['/public']['GET']['output'];
		expectTypeOf<Extract<Me, { status: 401 }>['data']>().toEqualTypeOf<{
			error: 'unauthenticated';
		}>();
		expectTypeOf<Extract<Public, { status: 401 }>>().toEqualTypeOf<never>();
	});

	test('an error becomes a 500 that leaks nothing', async () => {
		const original = console.error;
		console.error = () => {};
		try {
			const response = await call('/boom');
			expect(response.status).toBe(500);
			expect(await response.json()).toEqual({ error: 'internal' });
		} finally {
			console.error = original;
		}
	});

	test('an HttpError is answered as it says, onError first', async () => {
		const failing = alxia()
			.onError((error, { reply }) =>
				error instanceof RangeError
					? reply(422, { error: 'range' })
					: undefined,
			)
			.get('/range', () => {
				throw new RangeError();
			})
			.get('/teapot', () => {
				throw new HttpError(418, { error: 'teapot' });
			});
		const range = await failing.fetch(new Request('http://localhost/range'));
		expect(range.status).toBe(422);
		const teapot = await failing.fetch(new Request('http://localhost/teapot'));
		expect(teapot.status).toBe(418);
		expect(await teapot.json()).toEqual({ error: 'teapot' });
	});
});

describe('plugins', () => {
	const auth = alxia().derive(() => ({ user: 'ada' }));
	const posts = alxia({ prefix: '/posts' }).get('/:id', ({ params, reply }) =>
		reply(200, { id: params.id }),
	);
	const composed = alxia({ prefix: '/api' })
		.use(auth)
		.use(posts)
		.get('/me', ({ user, reply }) => reply(200, user));

	test("a plugin's routes are mounted under the app's prefix", async () => {
		const response = await composed.fetch(
			new Request('http://localhost/api/posts/7'),
		);
		expect(await response.json()).toEqual({ id: '7' });
		expectTypeOf<keyof RoutesOf<typeof composed>>().toEqualTypeOf<
			'/api/posts/:id' | '/api/me'
		>();
	});

	test("a plugin's hooks apply to the routes after it", async () => {
		const response = await composed.fetch(
			new Request('http://localhost/api/me'),
		);
		expect(await response.text()).toBe('ada');
	});
});

describe('responses', () => {
	test('a reply that breaks its schema is a 500', async () => {
		const original = console.error;
		console.error = () => {};
		try {
			const broken = alxia().get(
				'/broken',
				{ response: { 200: z.object({ n: z.number() }) } },
				({ reply }) => reply(200, JSON.parse('{"n":"x"}')),
			);
			const response = await broken.fetch(
				new Request('http://localhost/broken'),
			);
			expect(response.status).toBe(500);
		} finally {
			console.error = original;
		}
	});

	test('a redirect needs no schema', async () => {
		const moved = alxia().get(
			'/old',
			{ response: { 200: z.string() } },
			({ redirect }) => redirect('/new', 301),
		);
		const response = await moved.fetch(new Request('http://localhost/old'));
		expect(response.status).toBe(301);
		expect(response.headers.get('location')).toBe('/new');
	});
});

describe('listen', () => {
	test("Bun.serve routes to the app's handlers", async () => {
		const server = app.listen({ port: 0 });
		try {
			const ok = await fetch(new URL('/users/1', server.url));
			expect(await ok.json()).toEqual({ id: 1, name: 'Ada' });
			const missing = await fetch(new URL('/nope', server.url));
			expect(missing.status).toBe(404);
			const wrong = await fetch(new URL('/health', server.url), {
				method: 'POST',
			});
			expect(wrong.status).toBe(405);
		} finally {
			await server.stop(true);
		}
	});
});

describe('types', () => {
	test('the route table records inputs and outcomes', () => {
		type Route = RoutesOf<typeof app>['/users/:id']['GET'];
		expectTypeOf<Route['input']>().toEqualTypeOf<{
			readonly params: { readonly id: string | number };
			readonly query?: { upper?: 'yes' | 'no' | undefined };
		}>();
		expectTypeOf<
			Extract<Route['output'], { status: 200 }>['data']
		>().toEqualTypeOf<{ id: number; name: string }>();
		expectTypeOf<Route['output']['status']>().toEqualTypeOf<
			200 | 404 | 400 | 500
		>();
	});

	test('mistakes in a route are compile errors', () => {
		alxia().get(
			'/users/:id',
			// @ts-expect-error: `name` is not a parameter of the path
			{ params: z.object({ name: z.string() }) },
			({ reply }) => reply(200),
		);
		alxia().get(
			'/users',
			// @ts-expect-error: `quey` is not a part of a route
			{ quey: z.object({}) },
			({ reply }) => reply(200),
		);
		alxia().get('/users', { response: { 200: User } }, ({ reply }) =>
			// @ts-expect-error: 201 is not declared
			reply(201, { id: 1, name: 'x' }),
		);
		alxia().get('/users', { response: { 200: User } }, ({ reply }) =>
			// @ts-expect-error: the body does not match the schema
			reply(200, { id: '1', name: 'x' }),
		);
	});
});
