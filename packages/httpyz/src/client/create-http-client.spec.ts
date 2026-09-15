/** The client on its own: no spec, no generated code. */
import { describe, expect, it } from 'bun:test';
import { Hono } from 'hono';
import { z } from 'zod';
import {
	createHttpClient,
	type HttpClientOptions,
	NetworkError,
	type StandardSchemaV1,
	TimeoutError,
	UndeclaredStatusError,
	unwrap,
	ValidationError,
} from '../index';

const Item = z.object({
	id: z.int(),
	name: z.string(),
	createdAt: z.iso
		.datetime()
		.transform((value) => new Date(value))
		.optional(),
});
const Problem = z.object({ title: z.string() });
const AT = '2024-05-01T10:00:00Z';

/** Echoes the body it read, and answers a few statuses. */
const app = new Hono()
	.all('/echo/*', async (c) =>
		c.json({
			type: c.req.header('content-type') ?? null,
			body: await c.req.text(),
		}),
	)
	.get('/items/:id', (c) => {
		const id = Number(c.req.param('id'));
		return id === 404
			? c.json({ title: 'missing' }, 404)
			: c.json({ id, name: 'item', createdAt: AT });
	})
	.delete('/items/:id', (c) => c.body(null, 204))
	.get('/broken', (c) => c.json({ id: 'x' }))
	.get('/boom', (c) => c.text('boom', 500));

/** Every request the client sent, cloned before the app read it. */
const sent: Request[] = [];
const http = (options: HttpClientOptions = {}) =>
	createHttpClient({
		baseUrl: 'http://api.test',
		fetch: async (request) => {
			sent.push(request.clone());
			return app.fetch(request);
		},
		...options,
	});
const failure = (call: Promise<unknown>) =>
	call.then(
		() => undefined,
		(caught: unknown) => caught,
	);
const echoed = async (call: Promise<{ data: unknown }>) =>
	(await call).data as { type: string | null; body: string };

describe('createHttpClient', () => {
	it('fills the path, whose parameters it types', async () => {
		await http().get('/echo/{a}/{b}', { param: { a: 'x y', b: 2 } });
		expect(sent.at(-1)?.url).toBe('http://api.test/echo/x%20y/2');
		// @ts-expect-error the path has {a} and {b}: param is required
		const unfilled = http().get('/echo/{a}/{b}');
		expect(await failure(unfilled)).toBeInstanceOf(TypeError);
		// @ts-expect-error b is missing
		const partial = http().get('/echo/{a}/{b}', { param: { a: 1 } });
		expect(await failure(partial)).toBeInstanceOf(TypeError);
		// A path without {name}s takes no param.
		await http().get('/echo/plain');
	});

	it('writes the query: a list as a repeated key, URLSearchParams as they are', async () => {
		await http().get('/echo/q', {
			query: { page: 2, tag: ['a', 'b'], since: new Date(AT), skip: undefined },
		});
		expect(sent.at(-1)?.url).toBe(
			'http://api.test/echo/q?page=2&tag=a&tag=b&since=2024-05-01T10%3A00%3A00.000Z',
		);
		await http().get('/echo/q', { query: new URLSearchParams('ids=1,2') });
		expect(sent.at(-1)?.url).toBe('http://api.test/echo/q?ids=1%2C2');
	});

	it('types each reply it declares, narrowed on its status, and checks it', async () => {
		const responses = { 200: Item, 404: Problem };
		const found = await http().get('/items/{id}', {
			param: { id: 7 },
			responses,
		});
		if (found.status === 404) throw new Error(found.data.title);
		const at: Date | undefined = found.data.createdAt;
		expect(at).toEqual(new Date(AT));

		const missing = await http().get('/items/{id}', {
			param: { id: 404 },
			responses,
		});
		expect([missing.status, missing.type, missing.data]).toEqual([
			404,
			'application/json',
			{ title: 'missing' },
		]);
		// @ts-expect-error 500 is not a status it declares
		expect(missing.status === 500).toBe(false);
	});

	it('takes a fetch that answers at once, and reads a status with no media type as no body', async () => {
		const direct = createHttpClient({
			baseUrl: 'http://api.test',
			fetch: app.fetch,
		});
		const gone = await direct.delete('/items/{id}', {
			param: { id: 1 },
			responses: { 204: {} },
		});
		const data: undefined = gone.data;
		expect([gone.status, gone.type, data]).toEqual([204, undefined, undefined]);
	});

	it('throws on a status it does not declare, and on a reply its schema refuses', async () => {
		const boom = await failure(
			http().get('/boom', { responses: { 200: Item } }),
		);
		expect(boom).toBeInstanceOf(UndeclaredStatusError);
		expect((boom as Error).message).toBe('GET /boom: no 500 reply is declared');

		const refused = await failure(
			http().get('/broken', { responses: { 200: Item } }),
		);
		expect(refused).toBeInstanceOf(ValidationError);
		expect((refused as ValidationError).failure).toMatchObject({
			kind: 'response',
			method: 'get',
			path: '/broken',
			status: 200,
			issues: [
				{ target: 'response', path: ['id'] },
				{ target: 'response', path: ['name'] },
			],
		});

		// Unchecked, a reply is taken at its word.
		const trusted = await http().get('/broken', {
			responses: { 200: Item },
			validate: false,
		});
		expect(trusted.data as unknown).toEqual({ id: 'x' });
	});

	it('returns what the schema was given, with decode: false', async () => {
		const reply = await http().get('/items/{id}', {
			param: { id: 1 },
			responses: { 200: Item },
			decode: false,
		});
		const at: string | undefined = unwrap(reply, 200).createdAt;
		expect(at).toBe(AT);
	});

	it('returns every reply when it declares none, read by its media type', async () => {
		const boom = await http().get('/boom');
		expect([boom.status, boom.type, boom.data]).toEqual([
			500,
			'text/plain',
			'boom',
		]);
		const item = await http().get('/items/{id}', { param: { id: 1 } });
		expect(item.data).toEqual({ id: 1, name: 'item', createdAt: AT });
		const gone = await http().delete('/items/{id}', { param: { id: 1 } });
		expect([gone.status, gone.type, gone.data]).toEqual([
			204,
			undefined,
			undefined,
		]);
	});

	it('declares a reply per media type, or one without content as null', async () => {
		const api = createHttpClient({
			baseUrl: 'http://api.test',
			fetch: async () =>
				new Response('a,b', { headers: { 'content-type': 'text/csv' } }),
		});
		const reply = await api.get('/export', {
			responses: { 200: { 'text/csv': z.string().min(1) }, 204: null },
		});
		if (reply.status === 204) throw new Error('no content');
		const csv: string = reply.data;
		expect([reply.type, csv]).toEqual(['text/csv', 'a,b']);
	});

	it('reads any Standard Schema, and a vendor without issue codes', async () => {
		const positive: StandardSchemaV1<unknown, number> = {
			'~standard': {
				version: 1,
				vendor: 'test',
				validate: async (value) =>
					typeof value === 'number' && value > 0
						? { value: value * 2 }
						: { issues: [{ message: 'not positive', path: [{ key: 'n' }] }] },
			},
		};
		let answer = 2;
		const api = createHttpClient({
			baseUrl: 'http://api.test',
			fetch: async () => Response.json(answer),
		});
		const call = () => api.get('/n', { responses: { 200: positive } });
		const doubled: number = unwrap(await call(), 200);
		expect(doubled).toBe(4);
		answer = -1;
		const error = await failure(call());
		expect((error as ValidationError).failure.issues).toEqual([
			{
				target: 'response',
				path: ['n'],
				code: 'custom',
				message: 'not positive',
			},
		]);
	});

	it('sends each body as its kind, unless the call sets a Content-Type', async () => {
		// A type the client sends with every call never wins over the body's.
		const api = http({ headers: { 'content-type': 'text/csv' } });
		expect(await echoed(api.post('/echo/json', { json: { a: 1 } }))).toEqual({
			type: 'application/json',
			body: '{"a":1}',
		});
		const patch = api.post('/echo/json', {
			json: { a: 1 },
			headers: { 'content-type': 'application/merge-patch+json' },
		});
		expect((await echoed(patch)).type).toBe('application/merge-patch+json');

		const form = await echoed(
			api.post('/echo/form', { form: { a: 1, tag: ['x', 'y'] } }),
		);
		expect(form.type).toStartWith('application/x-www-form-urlencoded');
		expect(form.body).toBe('a=1&tag=x&tag=y');
		const upload = await echoed(
			api.post('/echo/upload', { form: { file: new File(['x'], 'x.txt') } }),
		);
		expect(upload.type).toStartWith('multipart/form-data; boundary=');

		expect(await echoed(api.post('/echo/text', { text: 'hi' }))).toEqual({
			type: 'text/plain',
			body: 'hi',
		});
		const blob = new Blob(['<p>'], { type: 'text/html' });
		// Its own type, as Bun spells it: text/html;charset=utf-8.
		expect(await echoed(api.put('/echo/blob', { body: blob }))).toEqual({
			type: blob.type,
			body: '<p>',
		});
		// @ts-expect-error one body at a time
		const both = api.post('/echo/json', { json: {}, text: 'x' });
		await failure(both);
	});

	it('sends a Request of its own through the middleware, with the client headers', async () => {
		const seen: string[] = [];
		const api = http({
			headers: { 'x-client': '1' },
			use: [
				async (request, next, call) => {
					seen.push(`${call.method} ${call.path}`);
					return next(request);
				},
			],
		});
		const response = await api.send(
			new Request('http://api.test/echo/raw', { method: 'POST', body: 'x' }),
		);
		expect(await response.json()).toMatchObject({ body: 'x' });
		expect(seen).toEqual(['post /echo/raw']);
		expect(sent.at(-1)?.headers.get('x-client')).toBe('1');
	});
});

describe('errors', () => {
	/** Never replies: fails only when the request's signal aborts. */
	const hang = (request: Request) =>
		new Promise<Response>((_, reject) => {
			request.signal.addEventListener(
				'abort',
				() => reject(request.signal.reason),
				{ once: true },
			);
		});
	const stub = (
		fetch: HttpClientOptions['fetch'],
		options: HttpClientOptions = {},
	) => createHttpClient({ baseUrl: 'http://api.test', fetch, ...options });

	it('throws a NetworkError when fetch fails, naming the call', async () => {
		const down = stub(async () => {
			throw new TypeError('fetch failed');
		});
		const failed = await failure(down.get('/health'));
		expect(failed).toBeInstanceOf(NetworkError);
		expect((failed as Error).message).toBe('GET /health: no reply came back');
		expect((failed as Error).cause).toBeInstanceOf(TypeError);
		const named = await failure(down.get('/health', { operationId: 'health' }));
		expect((named as Error).message).toBe(
			'health (GET /health): no reply came back',
		);
	});

	it('throws a TimeoutError past the timeout', async () => {
		const late = await failure(stub(hang, { timeout: 10 }).get('/health'));
		expect(late).toBeInstanceOf(TimeoutError);
	});

	it('lets an abort the caller asked for through as it is', async () => {
		const controller = new AbortController();
		const pending = failure(
			stub(hang).get('/health', { signal: controller.signal }),
		);
		controller.abort();
		expect(((await pending) as Error).name).toBe('AbortError');
	});
});
