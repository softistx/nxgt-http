import { describe, expect, expectTypeOf, test } from 'bun:test';
import { client } from '@alxia/client';
import { alxia } from '@alxia/core';
import { openapi } from '@alxia/openapi';
import { z } from 'zod';
import { zq } from './coerce';
import { zodConverter } from './convert';

const app = alxia().get(
	'/search/:page',
	{
		params: z.object({ page: zq.int() }),
		query: z.object({
			tags: zq.array(z.string()).optional(),
			exact: zq.boolean().optional(),
			since: zq.date().optional(),
			filter: zq.json(z.object({ min: z.number() })).optional(),
		}),
		response: {
			200: z.object({
				page: z.number(),
				tags: z.array(z.string()),
				exact: z.boolean(),
				since: z.date().nullable(),
				min: z.number().nullable(),
			}),
		},
	},
	({ params, query, reply }) =>
		reply(200, {
			page: params.page,
			tags: query.tags ?? [],
			exact: query.exact ?? false,
			since: query.since ?? null,
			min: query.filter?.min ?? null,
		}),
);

describe('zq', () => {
	test('the client sends values, the server reads them typed', async () => {
		const result = await client(app).get('/search/:page', {
			params: { page: 2 },
			query: {
				tags: 'one',
				exact: true,
				since: new Date('2026-01-01T00:00:00Z'),
				filter: { min: 3 },
			},
		});
		expect(result.status).toBe(200);
		expect(result.data).toEqual({
			page: 2,
			tags: ['one'],
			exact: true,
			since: '2026-01-01T00:00:00.000Z',
			min: 3,
		});
	});

	test('a list given more than once, and refusals', async () => {
		const many = await app.request('/search/1?tags=a&tags=b&exact=0');
		expect(await many.json()).toMatchObject({ tags: ['a', 'b'], exact: false });
		expect((await app.request('/search/1.5')).status).toBe(400);
		expect((await app.request('/search/x')).status).toBe(400);
		expect((await app.request('/search/1?exact=maybe')).status).toBe(400);
		expect((await app.request('/search/1?filter={')).status).toBe(400);
	});

	test("the client's input is what it means to send", () => {
		expectTypeOf<z.input<ReturnType<typeof zq.int>>>().toEqualTypeOf<
			string | number
		>();
		expectTypeOf<
			z.output<ReturnType<typeof zq.boolean>>
		>().toEqualTypeOf<boolean>();
		expectTypeOf<
			z.output<ReturnType<typeof zq.array<z.ZodString>>>
		>().toEqualTypeOf<string[]>();
	});
});

describe('zodConverter', () => {
	test('a Date is documented as a date-time string', () => {
		const document = openapi(app, {
			info: { title: 'Search', version: '1' },
			convert: zodConverter,
		});
		const ok = document.paths['/search/{page}']?.get?.responses['200'];
		expect(ok?.content?.['application/json']?.schema).toMatchObject({
			properties: {
				since: {
					anyOf: [{ type: 'string', format: 'date-time' }, { type: 'null' }],
				},
			},
		});
	});

	test('leaves another vendor to the default', () => {
		expect(
			zodConverter({ '~standard': { vendor: 'valibot' } }, 'output'),
		).toBeUndefined();
	});
});
