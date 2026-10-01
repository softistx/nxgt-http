import { describe, expect, expectTypeOf, test } from 'bun:test';
import { alya, type InternalErrorBody } from '@alya/server';
import { z } from 'zod';
import { client, fillPath } from './client';

const User = z.object({
	id: z.number(),
	name: z.string(),
	createdAt: z.date(),
});

const app = alya()
	.get(
		'/users/:id',
		{
			params: z.object({ id: z.coerce.number() }),
			query: z.object({ fields: z.array(z.string()).optional() }),
			response: { 200: User, 404: z.object({ error: z.literal('not_found') }) },
		},
		({ params, query, reply }) =>
			params.id === 1
				? reply(200, {
						id: 1,
						name: query.fields?.join(',') ?? 'Ada',
						createdAt: new Date('2026-01-01T00:00:00Z'),
					})
				: reply(404, { error: 'not_found' }),
	)
	.post(
		'/users',
		{
			headers: z.object({ 'x-tenant': z.string() }),
			body: z.object({ name: z.string().min(1) }),
			response: { 201: z.object({ name: z.string(), tenant: z.string() }) },
		},
		({ body, headers, reply }) =>
			reply(201, { name: body.name, tenant: headers['x-tenant'] }),
	)
	.get('/health', ({ reply }) => reply(200, 'ok'))
	.delete('/users/:id', ({ reply }) => reply(204));

const api = client(app);

describe('client', () => {
	test('a call reads the reply, narrowed by its status', async () => {
		const result = await api.get('/users/:id', { params: { id: 1 } });
		expect(result.status).toBe(200);
		if (result.status === 200) {
			expectTypeOf(result.data).toEqualTypeOf<{
				id: number;
				name: string;
				createdAt: string;
			}>();
			expect(result.data).toEqual({
				id: 1,
				name: 'Ada',
				createdAt: '2026-01-01T00:00:00.000Z',
			});
		}
	});

	test('`ok` narrows to the successes', async () => {
		const result = await api.get('/users/:id', { params: { id: 2 } });
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expectTypeOf(result.status).toEqualTypeOf<404 | 400 | 500>();
		}
	});

	test('an array query is sent as a repeated key', async () => {
		const result = await api.get('/users/:id', {
			params: { id: 1 },
			query: { fields: ['a', 'b'] },
		});
		expect(result.status === 200 && result.data.name).toBe('a,b');
	});

	test('typed headers and a JSON body', async () => {
		const result = await api.post('/users', {
			headers: { 'x-tenant': 'acme' },
			body: { name: 'Grace' },
		});
		expect(result.status).toBe(201);
		expect(result.data).toEqual({ name: 'Grace', tenant: 'acme' });
	});

	test('the 400 of a refused request is typed', async () => {
		const result = await api.post('/users', {
			headers: { 'x-tenant': 'acme' },
			body: { name: '' },
		});
		if (result.status === 400) {
			expect(result.data.issues[0]?.target).toBe('body');
		} else throw new Error(`expected a 400, got ${result.status}`);
	});

	test('a route without schemas: text, and nothing', async () => {
		const health = await api.get('/health');
		expectTypeOf(health.data).toEqualTypeOf<'ok' | InternalErrorBody>();
		expect(health.data).toBe('ok');
		const deleted = await api.delete('/users/:id', { params: { id: 1 } });
		expect(deleted.status).toBe(204);
		expect(deleted.data).toBeUndefined();
	});

	test('mistakes are compile errors', () => {
		// Never called: only compiled.
		const _mistakes = () => {
			// @ts-expect-error: no such route
			void api.get('/nope');
			// @ts-expect-error: the params are required
			void api.get('/users/:id');
			// @ts-expect-error: no POST at this path
			void api.post('/health');
			// @ts-expect-error: the body must have a name
			void api.post('/users', { headers: { 'x-tenant': 'a' }, body: {} });
			// @ts-expect-error: the app has no PUT route
			void api.put;
		};
		expect(_mistakes).toBeFunction();
	});

	test('over HTTP, through a base URL', async () => {
		const server = app.listen({ port: 0 });
		try {
			const remote = client<typeof app>(server.url);
			const result = await remote.get('/users/:id', { params: { id: 1 } });
			expect(result.status).toBe(200);
		} finally {
			await server.stop(true);
		}
	});
});

describe('fillPath', () => {
	test('encodes each parameter, and keeps the slashes of a wildcard', () => {
		expect(fillPath('/users/:id', { id: 'a b' })).toBe('/users/a%20b');
		expect(fillPath('/files/*', { '*': 'a b/c' })).toBe('/files/a%20b/c');
	});

	test('throws on a missing parameter', () => {
		expect(() => fillPath('/users/:id', {})).toThrow(':id is missing');
	});
});
