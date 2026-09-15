/**
 * The mock end to end: the bound client calls it through MSW's
 * `getResponse`, so both ends read the same spec, and what the client checks
 * before sending is what the mock refuses.
 */
import { describe, expect, it, spyOn } from 'bun:test';
import {
	createHttpClient,
	unwrap,
	ValidationError,
	type ValidationIssue,
} from '@nxgt/httpyz';
import { createOpenApiClient } from '@nxgt/openapi-httpyz';
import { getResponse, HttpResponse, type RequestHandler } from 'msw';
import { operations as dated } from '../../test/generated/dates/operations';
import { operations } from '../../test/generated/operations';
import { MockReplyError } from '../errors/mock-reply-error';
import { createOpenApiMsw } from './create-openapi-msw';

const BASE = 'http://api.test';
const mock = createOpenApiMsw(operations, { baseUrl: BASE });

/** A client whose calls the handlers answer; a request none answers is a 599. */
const clientOf = (
	handlers: RequestHandler[],
	validate?: { request?: boolean; response?: boolean },
) =>
	createOpenApiClient(
		createHttpClient({
			baseUrl: BASE,
			fetch: async (request) =>
				(await getResponse(handlers, request)) ??
				new Response('unhandled', { status: 599 }),
		}),
		operations,
		validate === undefined ? {} : { validate },
	);

const item = { id: 1, name: 'a' };

describe('createOpenApiMsw', () => {
	it('answers with a declared reply, the parameters as the validators output them', async () => {
		const api = clientOf([
			mock.get('/items/{id}', ({ param, reply }) =>
				param.id === 404
					? reply(404, { title: 'missing' })
					: reply(200, { id: param.id, name: 'item' }),
			),
		]);
		const found = await api.get('/items/{id}', { param: { id: 7 } });
		expect(unwrap(found, 200)).toEqual({ id: 7, name: 'item' });
		const missing = await api.get('/items/{id}', { param: { id: 404 } });
		expect([missing.status, missing.type, missing.data]).toEqual([
			404,
			'application/problem+json',
			{ title: 'missing' },
		]);
	});

	it('reads the query and the headers as the server does', async () => {
		const api = clientOf([
			mock.op('listItems', ({ query, header, reply }) =>
				reply(200, { query, trace: header['x-trace'] ?? null }),
			),
		]);
		const reply = await api.get('/items', {
			query: { page: 2, tag: ['a', 'b'], ids: [1, 2], active: true },
			header: { 'x-trace': 't1' },
		});
		expect(unwrap(reply, 200)).toEqual({
			query: { page: 2, tag: ['a', 'b'], ids: [1, 2], active: true },
			trace: 't1',
		});
	});

	it('receives a JSON body, a form, text, binary, multipart, and a QUERY', async () => {
		const api = clientOf([
			mock.post('/items', ({ json, form, reply }) => {
				const made = json ?? form;
				return reply(201, { id: 1, name: made.name, price: made.price });
			}),
			mock.post('/items/{id}/note', ({ param, text, reply }) =>
				reply(200, `note ${param.id}: ${text}`),
			),
			mock.put('/items/{id}', async ({ body, reply }) => {
				expect(await body.text()).toBe('hi');
				return reply(204);
			}),
			mock.post('/uploads', ({ form, reply }) =>
				reply(201, {
					file: form.file instanceof File ? form.file.name : null,
					labels: form.labels ?? [],
				}),
			),
			mock.query('/items', ({ json, reply }) =>
				reply(200, [{ id: 1, name: json.name ?? 'any' }]),
			),
		]);
		const made = await api.post('/items', { json: { name: 'a', price: 2 } });
		expect(unwrap(made, 201)).toEqual({ id: 1, name: 'a', price: 2 });
		const form = await api.op('createItem', { form: { name: 'f', price: 3 } });
		expect(unwrap(form, 201)).toEqual({ id: 1, name: 'f', price: 3 });
		const note = await api.post('/items/{id}/note', {
			param: { id: 3 },
			text: 'hello',
		});
		expect([note.type, note.data]).toEqual(['text/plain', 'note 3: hello']);
		const stored = await api.put('/items/{id}', {
			param: { id: 3 },
			body: new TextEncoder().encode('hi'),
		});
		expect(stored.status).toBe(204);
		const upload = await api.op('upload', {
			form: { file: new File(['x'], 'x.txt'), labels: ['a', 'b'] },
		});
		expect(unwrap(upload, 201)).toEqual({ file: 'x.txt', labels: ['a', 'b'] });
		const found = await api.query('/items', { json: { name: 'x' } });
		expect(unwrap(found, 200)).toEqual([{ id: 1, name: 'x' }]);
	});

	it('replies without content, and passes a Response of its own as it is', async () => {
		const api = clientOf([
			mock.op('health', ({ reply }) => reply(204)),
			mock.delete('/items/{id}', () => new Response(null, { status: 204 })),
		]);
		expect((await api.op('health')).status).toBe(204);
		expect((await api.delete('/items/{id}', { param: { id: 1 } })).status).toBe(
			204,
		);
	});

	it('leaves a request to the next handler when the resolver returns nothing', async () => {
		const api = clientOf([
			mock.get('/items/{id}', ({ param, reply }) =>
				param.id === 1 ? reply(200, item) : undefined,
			),
			mock.get('/items/{id}', ({ param, reply }) =>
				reply(200, { id: param.id, name: 'next' }),
			),
		]);
		const reply = await api.get('/items/{id}', { param: { id: 2 } });
		expect(unwrap(reply, 200).name).toBe('next');
	});

	it('matches any origin without a baseUrl', async () => {
		const anywhere = createOpenApiMsw(operations);
		const response = await getResponse(
			[anywhere.op('health', ({ reply }) => reply(204))],
			new Request('https://elsewhere.example/health'),
		);
		expect(response?.status).toBe(204);
	});
});

describe('validation', () => {
	it('refuses what the server refuses, with the issues the client finds', async () => {
		const handlers = [
			mock.get('/items', ({ reply }) => reply(200, {})),
			mock.post('/items', ({ reply }) => reply(201, item)),
		];
		const unchecked = clientOf(handlers, { request: false });
		const checked = clientOf(handlers);
		const calls = [
			(api: typeof checked) =>
				api.get('/items', { query: { page: 0, ids: [1.5] } }),
			(api: typeof checked) =>
				api.post('/items', { json: { name: 1, price: 'x' } as never }),
			(api: typeof checked) =>
				api.op('createItem', { form: { name: 'f', price: 'abc' } as never }),
		];
		for (const call of calls) {
			const refused = await call(unchecked);
			expect(refused.status).toBe(400);
			const { issues } = refused.data as { issues: ValidationIssue[] };
			expect(issues.length).toBeGreaterThan(0);
			const error = await call(checked).catch((caught: unknown) => caught);
			expect(error).toBeInstanceOf(ValidationError);
			expect((error as ValidationError).failure.issues).toEqual(issues);
		}
	});

	it('answers a body it cannot read, as the server does', async () => {
		const handlers = [mock.post('/items', ({ reply }) => reply(201, item))];
		const send = (init: RequestInit) =>
			getResponse(
				handlers,
				new Request(`${BASE}/items`, { method: 'POST', ...init }),
			).then((response) => response?.json());
		const codes = async (init: RequestInit) =>
			((await send(init)) as { issues: ValidationIssue[] }).issues.map(
				(issue) => issue.code,
			);
		expect(
			await codes({
				body: '{',
				headers: { 'content-type': 'application/json' },
			}),
		).toEqual(['invalid_json']);
		expect(
			await codes({ body: 'x', headers: { 'content-type': 'text/csv' } }),
		).toEqual(['invalid_content_type']);
		expect(await codes({})).toEqual(['missing_body']);
	});

	it('answers as onValidationError says, or with the default 400', async () => {
		const custom = createOpenApiMsw(operations, {
			baseUrl: BASE,
			onValidationError: (failure) =>
				failure.operationId === 'getItem'
					? Response.json({ refused: failure.issues.length }, { status: 422 })
					: undefined,
		});
		const response = await getResponse(
			[custom.get('/items/{id}', ({ reply }) => reply(200, item))],
			new Request(`${BASE}/items/abc`),
		);
		expect(response?.status).toBe(422);
		expect(await response?.json()).toEqual({ refused: 1 });
	});

	it('fails a mock that replies as the spec does not declare', async () => {
		const logged = spyOn(console, 'error').mockImplementation(() => {});
		try {
			const drifted = [
				mock.get('/items/{id}', ({ reply }) =>
					reply(200, { id: 'x', name: 2 } as never),
				),
				mock.op('health', ({ reply }) => reply(200 as never, {} as never)),
			];
			for (const request of [`${BASE}/items/1`, `${BASE}/health`]) {
				const outcome = await getResponse(drifted, new Request(request)).then(
					(response) => response,
					(error: unknown) => error,
				);
				const error =
					outcome instanceof Response
						? await outcome.json().then((body) => body as { name?: string })
						: outcome;
				expect((error as { name?: string }).name).toBe('MockReplyError');
			}
		} finally {
			logged.mockRestore();
		}
	});

	it('names the reply and its issues in the error', () => {
		const error = new MockReplyError({
			kind: 'response',
			operationId: 'getItem',
			method: 'get',
			path: '/items/{id}',
			status: 200,
			issues: [
				{
					target: 'response',
					path: ['id'],
					code: 'invalid_type',
					message: 'Expected number',
				},
			],
		});
		expect(error.message).toContain('getItem (GET /items/{id})');
		expect(error.message).toContain('response.id: Expected number');
	});

	it('checks nothing with validate: false', async () => {
		const loose = createOpenApiMsw(operations, {
			baseUrl: BASE,
			validate: false,
		});
		const response = await getResponse(
			[
				loose.get('/items/{id}', ({ reply }) =>
					reply(200, { id: 'x' } as never),
				),
			],
			new Request(`${BASE}/items/abc`),
		);
		expect(response?.status).toBe(200);
	});
});

describe('dates', () => {
	it('sends Dates as their text, and the decoding client reads them back', async () => {
		const createdAt = new Date('2024-05-01T10:00:00.000Z');
		const datedMock = createOpenApiMsw(dated, { baseUrl: BASE });
		const api = createOpenApiClient(
			createHttpClient({
				baseUrl: BASE,
				fetch: async (request) =>
					(await getResponse(
						[
							datedMock.get('/items/{id}', ({ param, reply }) =>
								reply(200, { id: param.id, name: 'a', createdAt }),
							),
						],
						request,
					)) ?? new Response(null, { status: 599 }),
			}),
			dated,
		);
		const found = unwrap(
			await api.get('/items/{id}', { param: { id: 1 } }),
			200,
		);
		expect(found.createdAt).toEqual(createdAt);
	});
});

describe('the methods', () => {
	it('are the spec’s only, and refuse a path it lacks', () => {
		expect((mock as Record<string, unknown>).trace).toBeUndefined();
		expect(() =>
			(mock.get as (path: string, resolver: () => undefined) => unknown)(
				'/nope',
				() => undefined,
			),
		).toThrow('the spec has no operation at GET /nope');
		expect(HttpResponse).toBeDefined();
	});
});
