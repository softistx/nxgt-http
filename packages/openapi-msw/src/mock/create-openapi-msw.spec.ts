/**
 * The mock end to end: the bound client calls it through MSW's
 * `getResponse`, so both ends read the same spec, and what the client checks
 * before sending is what the mock refuses.
 */
import { afterAll, describe, expect, it, spyOn } from 'bun:test';
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
import type { MockResponse } from './types';

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

/** What a handler that failed answered: the error, as MSW reports it. */
const failureOf = async (handlers: RequestHandler[], url: string) => {
	const outcome = await getResponse(handlers, new Request(url)).then(
		(response) => response,
		(error: unknown) => error,
	);
	return outcome instanceof Response
		? ((await outcome.json()) as { name?: string; message?: string })
		: (outcome as { name?: string; message?: string });
};

describe('createOpenApiMsw', () => {
	it('answers with a declared response, the parameters as the validators output them', async () => {
		const api = clientOf([
			mock.get('/items/{id}', ({ param, response }) =>
				param.id === 404
					? response.notFound(
							{ title: 'missing' },
							{ type: 'application/problem+json' },
						)
					: response.ok({ id: param.id, name: 'item' }),
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
			mock.op('listItems', ({ query, header, response }) =>
				response.ok({ query, trace: header['x-trace'] ?? null }),
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
			mock.post('/items', ({ json, form, response }) => {
				const made = json ?? form;
				return response.created({ id: 1, name: made.name, price: made.price });
			}),
			mock.post('/items/{id}/note', ({ param, text, response }) =>
				response(200).text(`note ${param.id}: ${text}`),
			),
			mock.put('/items/{id}', async ({ body, response }) => {
				expect(await body.text()).toBe('hi');
				return response.noContent();
			}),
			mock.post('/uploads', ({ form, response }) =>
				response.created({
					file: form.file instanceof File ? form.file.name : null,
					labels: form.labels ?? [],
				}),
			),
			mock.query('/items', ({ json, response }) =>
				response.ok([{ id: 1, name: json.name ?? 'any' }]),
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

	it('leaves a request to the next handler when the resolver returns nothing', async () => {
		const api = clientOf([
			mock.get('/items/{id}', ({ param, response }) =>
				param.id === 1 ? response.ok(item) : undefined,
			),
			mock.get('/items/{id}', ({ param, response }) =>
				response.ok({ id: param.id, name: 'next' }),
			),
		]);
		const reply = await api.get('/items/{id}', { param: { id: 2 } });
		expect(unwrap(reply, 200).name).toBe('next');
	});

	it('matches any origin without a baseUrl', async () => {
		const anywhere = createOpenApiMsw(operations);
		const response = await getResponse(
			[anywhere.op('health', ({ response }) => response.noContent())],
			new Request('https://elsewhere.example/health'),
		);
		expect(response?.status).toBe(204);
	});
});

describe('response', () => {
	it('writes the media type named, with the headers and the status text', async () => {
		const response = await getResponse(
			[
				mock.get('/items/{id}', ({ response }) =>
					response(404).json(
						{ title: 'gone' },
						{
							type: 'application/json',
							headers: { 'x-trace': 't1' },
							statusText: 'Gone',
						},
					),
				),
			],
			new Request(`${BASE}/items/1`),
		);
		expect(response?.status).toBe(404);
		expect(response?.statusText).toBe('Gone');
		expect(response?.headers.get('content-type')).toBe('application/json');
		expect(response?.headers.get('x-trace')).toBe('t1');
		expect(await response?.json()).toEqual({ title: 'gone' });
	});

	it('writes each media kind with its writer, or any with body', async () => {
		const answer = (handler: RequestHandler) =>
			getResponse(
				[handler],
				new Request(`${BASE}/export`, {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: '{}',
				}),
			);
		const csv = await answer(
			mock.op('exportItems', ({ response }) => response(200).text('1,a')),
		);
		expect(csv?.headers.get('content-type')).toBe('text/csv');
		expect(await csv?.text()).toBe('1,a');
		const lines = await answer(
			mock.op('exportItems', ({ response }) =>
				response(200).binary(new Blob(['{"id":1,"name":"a"}\n'])),
			),
		);
		expect(lines?.headers.get('content-type')).toBe('application/jsonl');
		expect(await lines?.text()).toBe('{"id":1,"name":"a"}\n');
		const body = await answer(
			mock.op('exportItems', ({ response }) =>
				response.ok('2,b', { type: 'text/csv' }),
			),
		);
		expect(await body?.text()).toBe('2,b');
	});

	it('sends a Response of its own as it is, unchecked, with untyped', async () => {
		const api = clientOf([
			mock.delete('/items/{id}', ({ response }) =>
				response.untyped(new Response(null, { status: 204 })),
			),
		]);
		const deleted = await api.delete('/items/{id}', { param: { id: 1 } });
		expect(deleted.status).toBe(204);
		// Not what the spec declares, and sent all the same.
		const found = await getResponse(
			[
				mock.get('/items/{id}', ({ response }) =>
					response.untyped(HttpResponse.json({ id: 'not a number' })),
				),
			],
			new Request(`${BASE}/items/1`),
		);
		expect(await found?.json()).toEqual({ id: 'not a number' });
	});

	it('lets the request through with passthrough', async () => {
		const response = await getResponse(
			[mock.op('health', ({ response }) => response.passthrough())],
			new Request(`${BASE}/health`),
		);
		// MSW's own mark, which its interceptors read as "send it on".
		expect(response?.headers.get('x-msw-intention')).toBe('passthrough');
	});

	describe('bypass', () => {
		const real = Bun.serve({
			port: 0,
			fetch: (request) =>
				Response.json({
					id: Number(new URL(request.url).pathname.split('/').pop()),
					name: 'real',
				}),
		});
		afterAll(() => real.stop(true));

		it('sends the request to the network, for the resolver to read', async () => {
			const origin = `http://127.0.0.1:${real.port}`;
			const patched = createOpenApiMsw(operations, { baseUrl: origin });
			const response = await getResponse(
				[
					patched.get('/items/{id}', async ({ bypass, response }) => {
						const found = (await (await bypass()).json()) as typeof item;
						return response.ok({ ...found, name: `${found.name}, patched` });
					}),
				],
				new Request(`${origin}/items/3`),
			);
			expect(await response?.json()).toEqual({ id: 3, name: 'real, patched' });
		});
	});
});

describe('validation', () => {
	it('refuses what the server refuses, with the issues the client finds', async () => {
		const handlers = [
			mock.get('/items', ({ response }) => response.ok({})),
			mock.post('/items', ({ response }) => response.created(item)),
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
		const handlers = [
			mock.post('/items', ({ response }) => response.created(item)),
		];
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
			[custom.get('/items/{id}', ({ response }) => response.ok(item))],
			new Request(`${BASE}/items/abc`),
		);
		expect(response?.status).toBe(422);
		expect(await response?.json()).toEqual({ refused: 1 });
	});

	it('fails a mock that responds as the spec does not declare', async () => {
		const logged = spyOn(console, 'error').mockImplementation(() => {});
		try {
			const drifted: [RequestHandler, string, string][] = [
				[
					mock.get('/items/{id}', ({ response }) =>
						response.ok({ id: 'x', name: 2 } as never),
					),
					`${BASE}/items/1`,
					'response.id',
				],
				[
					mock.op('health', ({ response }) => response(200 as never).body()),
					`${BASE}/health`,
					'health declares no 200 reply',
				],
				[
					mock.get('/items/{id}', ({ response }) =>
						(
							response(200) as unknown as {
								text: (data: string) => MockResponse;
							}
						).text('a'),
					),
					`${BASE}/items/1`,
					'is application/json, not a text body',
				],
			];
			for (const [handler, url, message] of drifted) {
				const error = await failureOf([handler], url);
				expect(error.name).toBe('MockReplyError');
				expect(error.message).toContain(message);
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
				loose.get('/items/{id}', ({ response }) =>
					response.ok({ id: 'x' } as never),
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
							datedMock.get('/items/{id}', ({ param, response }) =>
								response.ok({ id: param.id, name: 'a', createdAt }),
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
	});
});
