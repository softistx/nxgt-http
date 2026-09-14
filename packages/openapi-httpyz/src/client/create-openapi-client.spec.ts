/**
 * The binding end to end, against a Hono app generated from the same spec,
 * served in-process as the client's `fetch`.
 */
import { describe, expect, it } from 'bun:test';
import {
	createHttpClient,
	type HttpClientOptions,
	ReplyStatusError,
	UndeclaredStatusError,
	unwrap,
	ValidationError,
} from '@nxgt/httpyz';
import { Hono } from 'hono';
import { createRoutes } from '../../test/generated/hono';
import { operations } from '../../test/generated/operations';
import type {
	ClientOperations,
	OperationsByRoute,
} from '../../test/generated/types';
import { createOpenApiClient } from '../index';

let stored = '';
const app = new Hono();
createRoutes(app)
	.get('/items', (c) =>
		c.json(
			{
				query: c.req.valid('query'),
				trace: c.req.valid('header')['x-trace'] ?? null,
			},
			200,
		),
	)
	.post('/items', (c) => {
		// Only the one the request sent is filled in.
		const item = c.req.valid('json') ?? c.req.valid('form');
		if (item.name === 'bad') return c.json({ title: 'bad name' }, 400);
		return c.json({ id: 1, name: item.name, price: item.price }, 201);
	})
	.query('/items', (c) =>
		c.json([{ id: 1, name: c.req.valid('json').name ?? 'any' }], 200),
	)
	.get('/items/{id}', (c) => {
		const { id } = c.req.valid('param');
		return id === 404
			? c.json({ title: 'missing' }, 404)
			: c.json({ id, name: 'item' }, 200);
	})
	.put('/items/{id}', async (c) => {
		stored = await c.req.text();
		return c.body(null, 204);
	})
	.delete('/items/{id}', (c) => c.body(null, 204))
	.post('/items/{id}/note', async (c) =>
		c.text(`note ${c.req.valid('param').id}: ${await c.req.text()}`, 200),
	)
	.post('/uploads', (c) => {
		const form = c.req.valid('form');
		return c.json(
			{
				file: form.file.name,
				labels: form.labels ?? [],
				copies: form.copies ?? null,
			},
			201,
		);
	})
	.get('/health', (c) => c.body(null, 204));

/** Every request the client sent, cloned before the app read it. */
const sent: Request[] = [];
const client = (options: HttpClientOptions = {}) =>
	createOpenApiClient<ClientOperations, OperationsByRoute>(
		createHttpClient({
			baseUrl: 'http://api.test',
			fetch: async (request) => {
				sent.push(request.clone());
				return app.fetch(request);
			},
			...options,
		}),
		operations,
	);

describe('createOpenApiClient', () => {
	it('writes the query and the headers as the server reads them', async () => {
		const query = {
			page: 2,
			tag: ['a', 'b'],
			ids: [1, 2],
			active: true,
			since: '2024-05-01T10:00:00Z',
		};
		const reply = await client().op('listItems', {
			query,
			header: { 'x-trace': 't1' },
		});
		expect(unwrap(reply, 200)).toEqual({ query, trace: 't1' });
		expect(sent.at(-1)?.url).toBe(
			'http://api.test/items?page=2&tag=a&tag=b&ids=1%2C2&active=true&since=2024-05-01T10%3A00%3A00Z',
		);
	});

	it('calls by method and path, and narrows the reply on its status', async () => {
		const api = client();
		const found = await api.get('/items/{id}', { param: { id: 7 } });
		expect([found.status, found.type, found.data]).toEqual([
			200,
			'application/json',
			{ id: 7, name: 'item' },
		]);
		if (found.status === 200) {
			const name: string = found.data.name;
			expect(name).toBe('item');
		}
		// c.json() sends application/json, which stands for the declared problem+json.
		const missing = await api.get('/items/{id}', { param: { id: 404 } });
		expect([missing.status, missing.type, missing.data]).toEqual([
			404,
			'application/problem+json',
			{ title: 'missing' },
		]);
	});

	it('sends a JSON body, a form, and a QUERY', async () => {
		const api = client();
		const made = await api.post('/items', { json: { name: 'a', price: 2 } });
		expect(unwrap(made, 201)).toEqual({ id: 1, name: 'a', price: 2 });
		expect(sent.at(-1)?.headers.get('content-type')).toBe('application/json');

		const form = await api.op('createItem', { form: { name: 'f', price: 3 } });
		expect(unwrap(form, 201)).toEqual({ id: 1, name: 'f', price: 3 });
		expect(sent.at(-1)?.headers.get('content-type')).toStartWith(
			'application/x-www-form-urlencoded',
		);

		const refused = await api.post('/items', { json: { name: 'bad' } });
		expect([refused.status, refused.data]).toEqual([
			400,
			{ title: 'bad name' },
		]);

		const found = await api.query('/items', { json: { name: 'x' } });
		expect(unwrap(found, 200)).toEqual([{ id: 1, name: 'x' }]);
		expect(sent.at(-1)?.method).toBe('QUERY');
	});

	it('sends text, binary and multipart bodies', async () => {
		const api = client();
		const note = await api.post('/items/{id}/note', {
			param: { id: 3 },
			text: 'hello',
		});
		expect([note.type, note.data]).toEqual(['text/plain', 'note 3: hello']);

		await api.put('/items/{id}', {
			param: { id: 3 },
			body: new TextEncoder().encode('hi'),
		});
		expect(stored).toBe('hi');
		expect(sent.at(-1)?.headers.get('content-type')).toBe(
			'application/octet-stream',
		);

		const upload = await api.op('upload', {
			form: { file: new File(['x'], 'x.txt'), labels: ['a', 'b'], copies: 2 },
		});
		expect(unwrap(upload, 201)).toEqual({
			file: 'x.txt',
			labels: ['a', 'b'],
			copies: 2,
		});
	});

	it('reads a reply without content, and takes no input when there is none', async () => {
		const api = client();
		const up = await api.op('health');
		expect([up.status, up.type, up.data]).toEqual([204, undefined, undefined]);
		const gone = await api.delete('/items/{id}', { param: { id: 1 } });
		expect(gone.status).toBe(204);
	});

	it('merges headers, and keeps the content type its body needs', async () => {
		const api = client({
			headers: async () => ({
				authorization: 'Bearer t',
				'content-type': 'text/plain',
			}),
		});
		await api.post(
			'/items',
			{ json: { name: 'a' } },
			{ headers: { 'x-extra': '1' } },
		);
		const request = sent.at(-1);
		expect([
			request?.headers.get('authorization'),
			request?.headers.get('x-extra'),
			request?.headers.get('content-type'),
		]).toEqual(['Bearer t', '1', 'application/json']);
	});

	it('joins a baseUrl that has a path prefix', async () => {
		const urls: string[] = [];
		const http = createHttpClient({
			baseUrl: 'http://api.test/v1/',
			fetch: async (request) => {
				urls.push(request.url);
				return new Response(null, { status: 204 });
			},
		});
		const api = createOpenApiClient<ClientOperations, OperationsByRoute>(
			http,
			operations,
		);
		await api.delete('/items/{id}', { param: { id: 5 } });
		expect(urls).toEqual(['http://api.test/v1/items/5']);
	});

	it('refuses, at compile time, a path the spec lacks and an input it needs', async () => {
		const api = client();
		const settled = (call: () => Promise<unknown>) =>
			call().then(
				() => 'resolved',
				() => 'rejected',
			);
		// @ts-expect-error the spec has no such path
		expect(await settled(() => api.get('/nope'))).toBe('rejected');
		// @ts-expect-error getItem needs its path parameter
		expect(await settled(() => api.op('getItem'))).toBe('rejected');
		// @ts-expect-error health takes no input: this is not a fetch option
		expect(await settled(() => api.op('health', { param: {} }))).toBe(
			'resolved',
		);
	});
});

describe('errors', () => {
	const stub = (fetch: HttpClientOptions['fetch']) =>
		createOpenApiClient<ClientOperations, OperationsByRoute>(
			createHttpClient({ baseUrl: 'http://api.test', fetch }),
			operations,
		);

	it('throws on a status the spec does not declare, naming the operation', async () => {
		const api = stub(async () => new Response('boom', { status: 500 }));
		const error = await api.op('health').catch((caught: unknown) => caught);
		expect(error).toBeInstanceOf(UndeclaredStatusError);
		expect((error as UndeclaredStatusError).status).toBe(500);
		expect((error as Error).message).toBe(
			'health (GET /health): no 500 reply is declared',
		);
	});

	it('refuses a reply of a media type the spec does not declare', async () => {
		const api = stub(
			async () =>
				new Response('<p>', {
					status: 200,
					headers: { 'content-type': 'text/html' },
				}),
		);
		const error = await api
			.get('/items/{id}', { param: { id: 1 } })
			.catch((caught: unknown) => caught);
		expect(error).toBeInstanceOf(ValidationError);
		expect((error as ValidationError).failure.issues[0]?.code).toBe(
			'invalid_content_type',
		);
	});

	it('unwrap throws on a declared reply of another status', async () => {
		const missing = await client().get('/items/{id}', { param: { id: 404 } });
		expect(() => unwrap(missing, 200)).toThrow(ReplyStatusError);
	});
});
