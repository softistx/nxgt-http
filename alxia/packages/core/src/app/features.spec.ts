import { describe, expect, expectTypeOf, test } from 'bun:test';
import { z } from 'zod';
import type { StandardSchemaV1 } from '../schema/standard-schema';
import { eventStream } from '../sse/event-stream';
import { type AnyAlxia, alxia, type Plugin, type RoutesOf } from './alxia';

/** A schema written by hand: the core needs no validator library. */
function positive(): StandardSchemaV1<unknown, number> {
	return {
		'~standard': {
			version: 1,
			vendor: 'hand',
			validate: (value) => {
				const number = Number(value);
				return Number.isFinite(number) && number > 0
					? { value: number }
					: { issues: [{ message: 'Expected a positive number' }] };
			},
		},
	};
}

describe('any Standard Schema', () => {
	test('a hand-written schema validates and types the route', async () => {
		const app = alxia().get(
			'/items',
			{ query: { '~standard': objectOf({ page: positive() }) } },
			({ query, reply }) => {
				expectTypeOf(query).toEqualTypeOf<{ page: number }>();
				return reply(200, query.page);
			},
		);
		expect(await (await app.request('/items?page=2')).json()).toBe(2);
		expect((await app.request('/items?page=-1')).status).toBe(400);
	});
});

function objectOf<
	Shape extends Record<string, StandardSchemaV1<unknown, unknown>>,
>(
	shape: Shape,
): StandardSchemaV1<
	unknown,
	{
		[Key in keyof Shape]: NonNullable<
			Shape[Key]['~standard']['types']
		>['output'];
	}
>['~standard'] {
	return {
		version: 1,
		vendor: 'hand',
		validate: async (value) => {
			const input = (value ?? {}) as Record<string, unknown>;
			const output: Record<string, unknown> = {};
			const issues = [];
			for (const [key, schema] of Object.entries(shape)) {
				const result = await schema['~standard'].validate(input[key]);
				if (result.issues) {
					issues.push(
						...result.issues.map((issue) => ({ ...issue, path: [key] })),
					);
				} else output[key] = result.value;
			}
			return issues.length > 0 ? { issues } : { value: output as never };
		},
	};
}

describe('global hooks', () => {
	test('onRequest answers before routing, onResponse sees every response', async () => {
		const seen: number[] = [];
		const app = alxia()
			.onRequest(({ request }) =>
				request.method === 'OPTIONS'
					? new Response(null, { status: 204 })
					: undefined,
			)
			.onResponse((response) => {
				seen.push(response.status);
				const headers = new Headers(response.headers);
				headers.set('x-powered-by', 'alxia');
				return new Response(response.body, {
					status: response.status,
					headers,
				});
			})
			.get('/', ({ reply }) => reply(200, 'home'));
		expect((await app.request('/', { method: 'OPTIONS' })).status).toBe(204);
		const home = await app.request('/');
		expect(home.headers.get('x-powered-by')).toBe('alxia');
		expect((await app.request('/nope')).status).toBe(404);
		expect(seen).toEqual([204, 200, 404]);
	});

	test('a function plugin adds global hooks and keeps the app type', async () => {
		const poweredBy =
			(name: string): Plugin =>
			(app) =>
				app.onResponse((response) => {
					response.headers.set('x-powered-by', name);
				});
		const app = alxia()
			.get('/a', ({ reply }) => reply(200, 'a'))
			.use(poweredBy('alxia'));
		expectTypeOf<keyof RoutesOf<typeof app>>().toEqualTypeOf<'/a'>();
		expect((await app.request('/a')).headers.get('x-powered-by')).toBe('alxia');
	});

	test('onStart and onStop run with listen and stop', async () => {
		const events: string[] = [];
		const app = alxia()
			.onStart(() => {
				events.push('start');
			})
			.onStop(() => {
				events.push('stop');
			})
			.get('/', ({ reply }) => reply(200));
		app.listen({ port: 0 });
		await Bun.sleep(0);
		expect(app.server).toBeDefined();
		await app.stop(true);
		expect(events).toEqual(['start', 'stop']);
		expect(app.server).toBeUndefined();
	});
});

describe('group', () => {
	const app = alxia()
		.decorate({ role: 'guest' as string })
		.group('/admin', (admin) =>
			admin
				.derive(({ request, reply }) =>
					request.headers.get('x-admin') === 'yes'
						? { role: 'admin' }
						: reply(403, { error: 'forbidden' as const }),
				)
				.get('/stats', ({ role, reply }) => reply(200, { role })),
		)
		.get('/public', ({ role, reply }) => reply(200, { role }));

	test("a group's hooks guard only its routes", async () => {
		expect((await app.request('/admin/stats')).status).toBe(403);
		const admin = await app.request('/admin/stats', {
			headers: { 'x-admin': 'yes' },
		});
		expect(await admin.json()).toEqual({ role: 'admin' });
		expect(await (await app.request('/public')).json()).toEqual({
			role: 'guest',
		});
	});

	test('its routes are typed under its prefix, with its replies', () => {
		type Routes = RoutesOf<typeof app>;
		expectTypeOf<keyof Routes>().toEqualTypeOf<'/admin/stats' | '/public'>();
		expectTypeOf<
			Extract<Routes['/admin/stats']['GET']['output'], { status: 403 }>['data']
		>().toEqualTypeOf<{ error: 'forbidden' }>();
		expectTypeOf<
			Extract<Routes['/public']['GET']['output'], { status: 403 }>
		>().toEqualTypeOf<never>();
	});
});

describe('cookies', () => {
	const app = alxia()
		.get(
			'/session',
			{ cookies: z.object({ session: z.string() }) },
			({ cookies, reply }) => reply(200, cookies.session),
		)
		.post('/login', ({ set, reply }) => {
			set.cookies.set('session', 'abc', { httpOnly: true, path: '/' });
			return reply(204);
		});

	test('cookies are validated and set', async () => {
		expect((await app.request('/session')).status).toBe(400);
		const read = await app.request('/session', {
			headers: { cookie: 'session=abc' },
		});
		expect(await read.text()).toBe('abc');
		const login = await app.request('/login', { method: 'POST' });
		expect(login.headers.getSetCookie()[0]).toContain('session=abc');
		expect(login.headers.getSetCookie()[0]).toContain('HttpOnly');
	});
});

describe('requests', () => {
	test('HEAD runs the GET route and sends no body', async () => {
		const app = alxia().get('/a', ({ reply }) => reply(200, 'body'));
		const response = await app.request('/a', { method: 'HEAD' });
		expect(response.status).toBe(200);
		expect(await response.text()).toBe('');
	});

	test('a body parser the app adds is tried first', async () => {
		const app = alxia()
			.parser('application/csv', async (request) =>
				(await request.text()).split(','),
			)
			.post('/csv', { body: z.array(z.string()) }, ({ body, reply }) =>
				reply(200, body.length),
			);
		const response = await app.request('/csv', {
			method: 'POST',
			headers: { 'content-type': 'application/csv' },
			body: 'a,b,c',
		});
		expect(await response.json()).toBe(3);
	});

	test('the ip is read by the option', async () => {
		const app = alxia({
			ip: (request) => request.headers.get('x-forwarded-for') ?? undefined,
		}).get('/ip', ({ ip, reply }) => reply(200, ip ?? 'none'));
		const response = await app.request('/ip', {
			headers: { 'x-forwarded-for': '10.0.0.1' },
		});
		expect(await response.text()).toBe('10.0.0.1');
	});
});

describe('server-sent events', () => {
	const Tick = z.object({ n: z.number() });
	const app = alxia()
		.get('/ticks', { response: { 200: eventStream(Tick) } }, ({ reply }) =>
			reply(
				200,
				(async function* () {
					yield { n: 1 };
					yield { n: 2 };
				})(),
			),
		)
		.get('/free', ({ reply }) =>
			reply(
				200,
				(async function* () {
					yield 'a';
				})(),
			),
		);

	test('each value is an event of JSON', async () => {
		const response = await app.request('/ticks');
		expect(response.headers.get('content-type')).toBe('text/event-stream');
		expect(await response.text()).toBe('data: {"n":1}\n\ndata: {"n":2}\n\n');
	});

	test('the client reads an async iterable of the values', () => {
		type Routes = RoutesOf<typeof app>;
		expectTypeOf<
			Extract<Routes['/ticks']['GET']['output'], { status: 200 }>['data']
		>().toEqualTypeOf<AsyncIterable<{ n: number }>>();
		expectTypeOf<
			Extract<Routes['/free']['GET']['output'], { status: 200 }>['data']
		>().toEqualTypeOf<AsyncIterable<string>>();
	});

	test('an event its schema refuses ends the stream', async () => {
		const original = console.error;
		console.error = () => {};
		try {
			const broken = alxia().get(
				'/broken',
				{ response: { 200: eventStream(Tick) } },
				({ reply }) =>
					reply(
						200,
						(async function* () {
							yield { n: 1 };
							yield JSON.parse('{"n":"x"}');
						})(),
					),
			);
			const response = await broken.request('/broken');
			await expect(response.text()).rejects.toThrow();
		} finally {
			console.error = original;
		}
	});
});

describe('websockets', () => {
	const Chat = z.object({ text: z.string().min(1) });
	const app = alxia()
		.derive(({ request }) => ({
			user: new URL(request.url).searchParams.get('user') ?? 'anonymous',
		}))
		.ws(
			'/rooms/:room',
			{ message: Chat, send: z.object({ from: z.string(), text: z.string() }) },
			{
				open(socket) {
					expectTypeOf(socket.data.params.room).toBeString();
					socket.subscribe(socket.data.params.room);
				},
				async message(socket, chat) {
					expectTypeOf(chat).toEqualTypeOf<{ text: string }>();
					await socket.send({ from: socket.data.user, text: chat.text });
				},
			},
		);

	test('the route table records what each side sends', () => {
		type Socket = RoutesOf<typeof app>['/rooms/:room']['WS'];
		expectTypeOf<Socket['send']>().toEqualTypeOf<{ text: string }>();
		expectTypeOf<Socket['input']>().toEqualTypeOf<{
			readonly params: { readonly room: string | number };
		}>();
	});

	test('messages are validated, replies sent as JSON', async () => {
		const server = app.listen({ port: 0 });
		try {
			const url = new URL('/rooms/lobby?user=ada', server.url);
			url.protocol = 'ws:';
			const socket = new WebSocket(url);
			const received: unknown[] = [];
			const done = new Promise<void>((resolve) => {
				socket.onmessage = (event) => {
					received.push(JSON.parse(String(event.data)));
					if (received.length === 2) resolve();
				};
			});
			await new Promise((resolve) => {
				socket.onopen = resolve;
			});
			socket.send(JSON.stringify({ text: '' }));
			socket.send(JSON.stringify({ text: 'hello' }));
			await done;
			socket.close();
			expect(received[0]).toMatchObject({ error: 'validation' });
			expect(received[1]).toEqual({ from: 'ada', text: 'hello' });
		} finally {
			await app.stop(true);
		}
	});

	test('without a server, or without an upgrade, a socket route is a 426', async () => {
		const response = await app.request('/rooms/lobby');
		expect(response.status).toBe(426);
	});
});

describe('plugins typed as functions', () => {
	test('Plugin is assignable from a generic function', () => {
		const identity: Plugin = <App extends AnyAlxia>(app: App) => app;
		expect(typeof identity).toBe('function');
	});
});
