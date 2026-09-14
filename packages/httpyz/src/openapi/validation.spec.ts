/**
 * `validate` and `decode`, against the server's own validators: what the
 * binding refuses, the Hono app generated from the same spec refuses too,
 * with the same issues.
 */
import { describe, expect, it, spyOn } from 'bun:test';
import { Hono } from 'hono';
import { operations as dated } from '../../test/generated/dates/operations';
import type {
	ClientOperations as DOps,
	OperationsByRoute as DRoutes,
} from '../../test/generated/dates/types';
import { createRoutes } from '../../test/generated/hono';
import { operations } from '../../test/generated/operations';
import type {
	ClientOperations,
	OperationsByRoute,
} from '../../test/generated/types';
import {
	createHttpClient,
	UndeclaredStatusError,
	unwrap,
	ValidationError,
	type ValidationIssue,
} from '../index';
import { createOpenApiClient, type OpenApiOptions } from './index';

const BAD_ITEM = { id: 'x', name: 2 };

const app = new Hono();
createRoutes(app)
	.get('/items', (c) =>
		c.json({ query: c.req.valid('query'), trace: null }, 200),
	)
	.post('/items', (c) => c.json({ id: 1, name: 'a' }, 201))
	.get('/items/{id}', (c) => c.json(BAD_ITEM as never, 200));

/** The same reply, from routes that check theirs. */
const strict = new Hono();
createRoutes(strict, { validateResponses: true }).get('/items/{id}', (c) =>
	c.json(BAD_ITEM as never, 200),
);

let sent = 0;
const http = createHttpClient({
	baseUrl: 'http://api.test',
	fetch: async (request) => {
		sent += 1;
		return app.fetch(request);
	},
});
const client = (options: OpenApiOptions = {}) =>
	createOpenApiClient<ClientOperations, OperationsByRoute>(
		http,
		operations,
		options,
	);
type Api = ReturnType<typeof client>;
type Call = (api: Api) => Promise<{ status: number; data: unknown }>;

const ITEM = { id: 1, name: 'a', createdAt: '2024-05-01T10:00:00.000Z' };
const answering = (body: unknown) =>
	createHttpClient({
		baseUrl: 'http://api.test',
		fetch: async () => Response.json(body),
	});

describe('validate', () => {
	it('refuses a request the server refuses, with its issues, and sends nothing', async () => {
		const loose = client();
		const checked = client({ validate: { request: true } });
		/** The issues of the server's 400, declared or not. */
		const served = async (call: Call): Promise<ValidationIssue[]> => {
			const reply = await call(loose).catch(async (error: unknown) => {
				if (!(error instanceof UndeclaredStatusError)) throw error;
				return { status: error.status, data: await error.response.json() };
			});
			expect(reply.status).toBe(400);
			return (reply.data as { issues: ValidationIssue[] }).issues;
		};
		const cases: [string, Call][] = [
			[
				'listItems',
				(api) => api.get('/items', { query: { page: 0, ids: [1.5] } }),
			],
			[
				'createItem',
				(api) => api.post('/items', { json: { name: 1, price: 'x' } as never }),
			],
			[
				'createItem',
				(api) =>
					api.op('createItem', { form: { name: 'f', price: 'abc' } as never }),
			],
		];
		for (const [operationId, call] of cases) {
			const issues = await served(call);
			expect(issues.length).toBeGreaterThan(0);
			const before = sent;
			const error = await call(checked).catch((caught: unknown) => caught);
			expect(sent).toBe(before);
			expect(error).toBeInstanceOf(ValidationError);
			expect((error as ValidationError).failure).toMatchObject({
				kind: 'request',
				operationId,
				issues,
			});
		}
	});

	it('refuses a reply the server refuses, with its issues', async () => {
		const logged = spyOn(console, 'error').mockImplementation(() => {});
		try {
			expect((await strict.request('/items/1')).status).toBe(500);
			const issues = logged.mock.calls[0]?.[1] as ValidationIssue[];
			expect(issues.length).toBeGreaterThan(0);
			const call = (api: Api) => api.get('/items/{id}', { param: { id: 1 } });
			// Unchecked, the reply is taken at its word.
			expect((await call(client())).data as unknown).toEqual(BAD_ITEM);
			const error = await call(client({ validate: true })).catch(
				(caught: unknown) => caught,
			);
			expect(error).toBeInstanceOf(ValidationError);
			expect((error as ValidationError).failure).toEqual({
				kind: 'response',
				operationId: 'getItem',
				method: 'get',
				path: '/items/{id}',
				status: 200,
				issues,
			});
		} finally {
			logged.mockRestore();
		}
	});

	it('refuses an empty reply where JSON is declared', async () => {
		const empty = createHttpClient({
			baseUrl: 'http://api.test',
			fetch: async () =>
				new Response('', { headers: { 'content-type': 'application/json' } }),
		});
		const api = createOpenApiClient<ClientOperations, OperationsByRoute>(
			empty,
			operations,
			{ validate: { response: true } },
		);
		const error = await api
			.get('/items/{id}', { param: { id: 1 } })
			.catch((caught: unknown) => caught);
		expect((error as ValidationError).failure.issues[0]?.code).toBe(
			'invalid_json',
		);
	});
});

describe('decode', () => {
	it('keeps a checked reply as it came, and decodes it with decode', async () => {
		const wire = createOpenApiClient<DOps, DRoutes>(answering(ITEM), dated, {
			validate: true,
		});
		const kept = unwrap(
			await wire.get('/items/{id}', { param: { id: 1 } }),
			200,
		);
		const text: string | undefined = kept.createdAt;
		expect(text).toBe(ITEM.createdAt);

		const decoding = createOpenApiClient<DOps, DRoutes, true>(
			answering(ITEM),
			dated,
			{ decode: true },
		);
		const decoded = unwrap(
			await decoding.get('/items/{id}', { param: { id: 1 } }),
			200,
		);
		const date: Date | undefined = decoded.createdAt;
		expect(date).toEqual(new Date(ITEM.createdAt));
	});

	it('types the replies as decoded only for a client that decodes', () => {
		const http = answering(ITEM);
		// @ts-expect-error decoding changes the replies' types: say so with `true`
		createOpenApiClient<DOps, DRoutes>(http, dated, { decode: true });
		// @ts-expect-error a client typed as decoding must decode
		createOpenApiClient<DOps, DRoutes, true>(http, dated, {});
		// @ts-expect-error nor may it leave its options out
		createOpenApiClient<DOps, DRoutes, true>(http, dated);
	});
});
