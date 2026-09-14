/**
 * The Hono engine end to end: the fixtures' generated routes on a real Hono
 * app, driven with `app.request()`.
 */
import { describe, expect, it, spyOn } from 'bun:test';
import { type Context, Hono, type MiddlewareHandler, type Next } from 'hono';
import { z } from 'zod';
import * as kitchen from '../../test/generated/kitchen-sink/hono';
import type { Pet } from '../../test/generated/kitchen-sink/types';
import * as search from '../../test/generated/query/hono';
import { createApi, createRoutes } from '../../test/generated/split/hono';
import type { Employee } from '../../test/generated/split/types';
import {
	createApi as engine,
	type OperationTable,
	type RuntimeOperation,
} from './engine';
import type { ValidationIssue } from './errors';
import type { Method } from './types';

const ID = '3f1c2a4e-8b7d-4c1e-9a2b-1c2d3e4f5a6b';
const ada: Employee = {
	id: ID,
	name: 'Ada',
	email: 'ada@example.com',
	createdAt: '2024-05-01T10:00:00Z',
};

const json = (
	method: string,
	body: unknown,
	headers: Record<string, string> = {},
): RequestInit => ({
	method,
	body: JSON.stringify(body),
	headers: { 'content-type': 'application/json', ...headers },
});

/** `[target, path]` of each issue a 400 or 500 lists. */
async function issues(res: Response): Promise<string[][]> {
	const body = (await res.json()) as { issues: ValidationIssue[] };
	return body.issues.map((issue) => [issue.target, issue.path.join('.')]);
}

const auth: MiddlewareHandler = async (c, next) => {
	if (!c.req.header('authorization')) return c.json({ status: 401 }, 401);
	await next();
};

describe('hono routes', () => {
	it('hands the handler validated, typed input, even after a middleware read the body', async () => {
		const app = new Hono();
		const peek: MiddlewareHandler = async (c, next) => {
			await c.req.json();
			await next();
		};
		createRoutes(app).put('/employees/{id}', peek, (c) => {
			const { id } = c.req.valid('param');
			const body = c.req.valid('json');
			return c.json({ ...ada, id, name: body.name }, 200);
		});
		const res = await app.request(
			`/employees/${ID}`,
			json('PUT', { name: 'Grace', email: 'grace@example.com', extra: 1 }),
		);
		expect(res.status).toBe(200);
		expect(await res.json()).toMatchObject({ id: ID, name: 'Grace' });
	});

	it('answers every issue of every target at once, with a 400', async () => {
		const app = new Hono();
		const pet: Pet = { kind: 'cat', lives: 9 };
		kitchen.createRoutes(app).get('/pets/{petId}', (c) => c.json(pet, 200));
		const res = await app.request('/pets/0?verbose=yes');
		expect(res.status).toBe(400);
		expect(await issues(res.clone())).toEqual([
			['param', 'petId'],
			['query', 'verbose'],
			['header', 'x-request-id'],
		]);
		expect(await res.json()).toMatchObject({
			status: 400,
			message: 'errors.validation-failed',
		});

		const ok = await app.request('/pets/7?verbose=TRUE&ids=1,2', {
			headers: { 'X-Request-Id': ID },
		});
		expect(ok.status).toBe(200);
	});

	it('refuses bodies that are not JSON, not declared, or missing', async () => {
		const app = new Hono();
		createRoutes(app).post('/employees', (c) => c.json(ada, 201));
		const post = (init: RequestInit) =>
			app.request('/employees', { method: 'POST', ...init });
		const code = async (res: Response) =>
			((await res.json()) as { issues: ValidationIssue[] }).issues[0]?.code;

		const bad = await post({
			body: '{',
			headers: { 'content-type': 'application/json' },
		});
		expect([bad.status, await code(bad)]).toEqual([400, 'invalid_json']);
		const text = await post({
			body: 'Ada',
			headers: { 'content-type': 'text/plain' },
		});
		expect([text.status, await code(text)]).toEqual([
			400,
			'invalid_content_type',
		]);
		const none = await post({});
		expect([none.status, await code(none)]).toEqual([400, 'missing_body']);
		const fine = await post(
			json('POST', { name: 'Ada', email: 'ada@example.com' }),
		);
		expect(fine.status).toBe(201);
	});

	it('runs middlewares first, and validates where routes.validate says', async () => {
		const app = new Hono();
		const routes = createRoutes(app);
		const guard: MiddlewareHandler = async (c, next) => {
			const body = c.req.valid('json' as never) as unknown as Employee;
			if (body.name === 'Mallory') return c.json({ status: 403 }, 403);
			await next();
		};
		routes
			.put('/employees/{id}', auth, (c) => c.json(ada, 200))
			.post('/employees', auth, routes.validate, guard, (c) =>
				c.json(ada, 201),
			);
		const token = { authorization: 'Bearer x' };

		const put = await app.request(`/employees/${ID}`, json('PUT', {}));
		expect(put.status).toBe(401);
		const ladder = await Promise.all(
			[
				json('POST', {}),
				json('POST', {}, token),
				json('POST', { name: 'Mallory', email: 'm@example.com' }, token),
				json('POST', { name: 'Ada', email: 'ada@example.com' }, token),
			].map(async (init) => (await app.request('/employees', init)).status),
		);
		expect(ladder).toEqual([401, 400, 403, 201]);
	});

	it('lets onValidationError answer, throw, or fall back, per app or per route', async () => {
		const app = new Hono();
		app.onError((error, c) => c.text(error.message, 418));
		const routes = createRoutes(app, {
			onValidationError: (failure, c) =>
				c.json({ count: failure.issues.length }, 422),
		});
		routes.post('/employees', (c) => c.json(ada, 201));
		routes
			.with({
				onValidationError: () => {
					throw new Error('translated');
				},
			})
			.put('/employees/{id}', (c) => c.json(ada, 200));
		routes
			.with({ onValidationError: () => undefined })
			.get('/employees', (c) => c.json([ada], 200));

		const answered = await app.request('/employees', json('POST', {}));
		expect(answered.status).toBe(422);
		expect(await answered.json()).toEqual({ count: 2 });
		const thrown = await app.request(`/employees/${ID}`, json('PUT', {}));
		expect([thrown.status, await thrown.text()]).toEqual([418, 'translated']);
		const fallback = await app.request('/employees?page=0');
		expect(fallback.status).toBe(400);
	});

	it('serves QUERY with its body, and replies without content', async () => {
		const app = new Hono();
		search.createRoutes(app).query('/employees', (c) => {
			const { first } = c.req.valid('json');
			return c.json([{ id: ID, score: first }], 200);
		});
		createRoutes(app).delete('/employees/{id}', (c) => c.body(null, 204));
		kitchen.createRoutes(app).get('/pets/{petId}', (c) => c.body(null, 304));

		const found = await app.request(
			'/employees',
			json('QUERY', { name: null }),
		);
		expect(await found.json()).toEqual([{ id: ID, score: 20 }]);
		expect(
			(await app.request(`/employees/${ID}`, { method: 'DELETE' })).status,
		).toBe(204);
		const pet = await app.request('/pets/1', {
			headers: { 'x-request-id': ID },
		});
		expect(pet.status).toBe(304);
	});

	it('reads a form: numbers, flags and lists arrive as text', async () => {
		const app = new Hono();
		kitchen.createRoutes(app).post('/uploads', (c) => {
			const form = c.req.valid('form');
			return c.text(
				`${form?.copies} ${form?.public} ${form?.labels?.join('+')} ${form?.file?.name}`,
				200,
			);
		});
		const upload = (fields: [string, string | File][]) => {
			const body = new FormData();
			for (const [name, value] of fields) body.append(name, value);
			return app.request('/uploads', { method: 'POST', body });
		};

		const many = await upload([
			['copies', '2'],
			['labels', 'a'],
			['labels', 'b'],
			['file', new File(['x'], 'x.txt')],
		]);
		expect(await many.text()).toBe('2 false a+b x.txt');
		const one = await upload([
			['copies', '1'],
			['public', 'true'],
			['labels', 'a'],
		]);
		expect(await one.text()).toBe('1 true a undefined');
		const bad = await upload([['copies', 'x']]);
		expect(bad.status).toBe(400);
		expect(await issues(bad)).toEqual([['form', 'copies']]);
	});

	it('checks replies against the spec when asked, and logs their issues rather than sending them', async () => {
		const app = new Hono();
		const logged = spyOn(console, 'error').mockImplementation(() => {});
		createRoutes(app, { validateResponses: true })
			.get('/employees', (c) => c.json([ada], 200))
			.get('/employees/{id}', (c) =>
				c.json({ ...ada, email: 'nope' } as Employee, 200),
			)
			.delete('/employees/{id}', (c) => c.body(null, 500 as 204));

		expect((await app.request('/employees')).status).toBe(200);
		const invalid = await app.request(`/employees/${ID}`);
		expect(invalid.status).toBe(500);
		const body = await invalid.json();
		expect(body).toMatchObject({
			message: 'errors.response-validation-failed',
		});
		expect(body).not.toHaveProperty('issues');
		expect(logged.mock.calls[0]?.[1]).toMatchObject([
			{ target: 'response', path: ['email'] },
		]);
		const undeclared = await app.request(`/employees/${ID}`, {
			method: 'DELETE',
		});
		expect(undeclared.status).toBe(500);
		expect(logged.mock.calls[1]?.[1]).toMatchObject([
			{ code: 'undeclared_status' },
		]);
		logged.mockRestore();
	});

	it('mounts a module under a prefix and a tag, and reports what is left', async () => {
		const api = createApi();
		const root = new Hono();
		const employees = new Hono();
		api
			.routes(employees, { prefix: '/employees', tag: 'employees' })
			.get('/employees', (c) => c.json([ada], 200))
			.operation('getEmployee', (c) =>
				c.json({ ...ada, id: c.req.valid('param').id }, 200),
			);
		root.route('/employees', employees);

		expect((await root.request('/employees')).status).toBe(200);
		expect(await (await root.request('/employees/42')).json()).toMatchObject({
			id: '42',
		});
		const left = ['createEmployee', 'updateEmployee', 'deleteEmployee'];
		expect(api.missing()).toEqual(left);
		expect(api.missing('employees')).toEqual(left);
		expect(() => api.assertComplete()).toThrow(
			'3 operation(s) have no route:\n  createEmployee (POST /employees)',
		);
	});
});

describe('hono registration', () => {
	const operation = (path: string, tags: string[] = []) => ({
		method: 'get' as const,
		path,
		honoPath: path.replace(/\{([^}]+)\}/g, ':$1'),
		tags,
		parameters: [],
		param: z.object({}),
		query: z.object({}),
		header: z.object({}),
		responses: {},
	});
	const table: OperationTable = {
		getUser: operation('/users/{id}', ['users']),
		getMe: operation('/users/me'),
	};
	type Loose = Record<string, (...args: unknown[]) => unknown>;
	const routesOn = (options: object = {}) =>
		engine(table).routes(new Hono(), options) as unknown as Loose;
	const handler = () => new Response();

	it('refuses a route that an earlier one would always answer for', () => {
		const routes = routesOn();
		routes.get?.('/users/{id}', handler);
		expect(() => routes.get?.('/users/me', handler)).toThrow(
			'getMe (GET /users/me) would never be reached: getUser (GET /users/{id}), registered before it',
		);
		const ordered = routesOn();
		ordered.get?.('/users/me', handler);
		expect(() => ordered.get?.('/users/{id}', handler)).not.toThrow();
	});

	it('refuses a second route, an unknown one, and one outside its scope', () => {
		const routes = routesOn();
		routes.get?.('/users/me', handler);
		expect(() => routes.operation?.('getMe', handler)).toThrow(
			'getMe (GET /users/me) already has a route',
		);
		expect(() => routes.get?.('/nope', handler)).toThrow(
			'The spec has no GET /nope operation',
		);
		expect(() => routes.operation?.('nope', handler)).toThrow(
			'nope is not an operationId of the spec',
		);
		expect(() =>
			routesOn({ tag: 'users' }).get?.('/users/me', handler),
		).toThrow('is not tagged users');
		expect(() =>
			routesOn({ prefix: '/accounts' }).get?.('/users/me', handler),
		).toThrow('is not under the prefix /accounts');
		const marked = routesOn();
		expect(() =>
			marked.get?.('/users/me', marked.validate, marked.validate, handler),
		).toThrow('routes.validate appears twice');
	});
});

describe('hono edge cases', () => {
	const op = (
		method: Method,
		path: string,
		extra: Partial<RuntimeOperation> = {},
	): RuntimeOperation => ({
		method,
		path,
		honoPath: path.replace(/\{([^}]+)\}/g, ':$1'),
		tags: [],
		parameters: [],
		param: z.object({}),
		query: z.object({}),
		header: z.object({}),
		responses: { 200: {} },
		...extra,
	});
	type Loose = Record<string, (...args: unknown[]) => unknown>;
	const on = (table: OperationTable, app: Hono, options: object = {}) =>
		engine(table, options).routes(app) as unknown as Loose;
	const ran = () => new Response('ran');
	const codes = async (res: Response) =>
		((await res.json()) as { issues: ValidationIssue[] }).issues.map(
			(issue) => issue.code,
		);

	it('refuses HEAD, and a parameter sharing its segment, and never lists them as missing', () => {
		const api = engine({
			getX: op('get', '/x'),
			headX: op('head', '/x'),
			file: op('get', '/files/{name}.json'),
		});
		const routes = api.routes(new Hono()) as unknown as Loose;
		expect(() => routes.head?.('/x', ran)).toThrow(
			'headX (HEAD /x): Hono answers HEAD with the GET route of /x',
		);
		expect(() => routes.get?.('/files/{name}.json', ran)).toThrow(
			'a path parameter must fill its whole segment, and {name}.json does not',
		);
		expect(api.missing()).toEqual(['getX']);
	});

	it('answers a malformed form, and a required body sent empty, with a 400', async () => {
		const body = (
			type: string,
			media: RuntimeOperation['responses'][0][0],
		) => ({
			body: { required: true, content: { [type]: media } },
		});
		const app = new Hono();
		const routes = on(
			{
				form: op(
					'post',
					'/form',
					body('multipart/form-data', { kind: 'form', schema: z.object({}) }),
				),
				text: op(
					'post',
					'/text',
					body('text/plain', { kind: 'text', schema: z.string() }),
				),
				bin: op(
					'post',
					'/bin',
					body('application/octet-stream', { kind: 'binary' }),
				),
			},
			app,
		);
		for (const path of ['/form', '/text', '/bin']) routes.post?.(path, ran);
		// With the length a client sends, which a Request built here leaves out.
		const post = (path: string, sent: string, type: string) =>
			app.request(path, {
				method: 'POST',
				body: sent,
				headers: {
					'content-type': type,
					'content-length': String(sent.length),
				},
			});
		const multipart = 'multipart/form-data; boundary=xx';

		const garbled = await post('/form', 'garbage', multipart);
		expect([garbled.status, await codes(garbled)]).toEqual([
			400,
			['invalid_form'],
		]);
		for (const [path, type] of [
			['/form', multipart],
			['/text', 'text/plain'],
			['/bin', 'application/octet-stream'],
		] as const) {
			const empty = await post(path, '', type);
			expect([path, empty.status, await codes(empty)]).toEqual([
				path,
				400,
				['missing_body'],
			]);
		}
		expect((await post('/text', 'hi', 'text/plain')).status).toBe(200);
		expect((await post('/bin', 'hi', 'application/octet-stream')).status).toBe(
			200,
		);
	});

	it('refuses a query key that takes one value when it is sent twice', async () => {
		const app = new Hono();
		on(
			{
				list: op('get', '/list', {
					parameters: [
						{ name: 'page', in: 'query', list: false, explode: true },
					],
					query: z.object({ page: z.string().optional() }),
				}),
			},
			app,
		).get?.('/list', ran);
		const twice = await app.request('/list?page=1&page=abc');
		expect([twice.status, await codes(twice)]).toEqual([
			400,
			['repeated_parameter'],
		]);
		expect((await app.request('/list?page=1')).status).toBe(200);
	});

	it('explains a body that a middleware read through c.req.raw', async () => {
		const app = new Hono();
		app.onError((error, c) => c.text(error.message, 500));
		const drain = async (c: Context, next: Next) => {
			await c.req.raw.text();
			await next();
		};
		on(
			{
				make: op('post', '/make', {
					body: {
						required: true,
						content: { 'application/json': { kind: 'json' } },
					},
				}),
			},
			app,
		).post?.('/make', drain, ran);
		const res = await app.request('/make', json('POST', {}));
		expect(await res.text()).toStartWith(
			'A middleware read the request body through c.req.raw',
		);
	});

	it('checks what c.json() and c.text() send against +json and text types, and leaves streams unread', async () => {
		const reply = (
			type: string,
			kind: 'json' | 'text',
			schema: z.ZodType,
		): RuntimeOperation['responses'] => ({ 200: { [type]: { kind, schema } } });
		const app = new Hono();
		const logged = spyOn(console, 'error').mockImplementation(() => {});
		const routes = on(
			{
				problem: op('get', '/problem', {
					responses: reply(
						'application/problem+json',
						'json',
						z.object({ a: z.number() }),
					),
				}),
				csv: op('get', '/csv', {
					responses: reply('text/csv', 'text', z.string().min(3)),
				}),
				events: op('get', '/events', {
					responses: reply('text/event-stream', 'text', z.string()),
				}),
			},
			app,
			{ validateResponses: true },
		);
		routes.get?.('/problem', (c: Context) => c.json({ a: 1 }, 200));
		routes.get?.('/csv', (c: Context) => c.text('a', 200));
		routes.get?.(
			'/events',
			() =>
				new Response(
					new ReadableStream({
						start(controller) {
							// Never closed, as an event stream is not.
							controller.enqueue(new TextEncoder().encode('data: 1\n\n'));
						},
					}),
					{ headers: { 'content-type': 'text/event-stream' } },
				),
		);
		expect((await app.request('/problem')).status).toBe(200);
		// Matched to text/csv, so its body is checked: too short.
		expect((await app.request('/csv')).status).toBe(500);
		expect((await app.request('/events')).status).toBe(200);
		logged.mockRestore();
	});
});
