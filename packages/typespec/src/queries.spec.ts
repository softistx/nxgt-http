/**
 * The emitter `@nxgt/typespec` on the queries fixture: a `POST` marked
 * `@queryMethod` is a real `QUERY` in OpenAPI 3.2, generated and served as
 * one, and in 3.1, which has no `QUERY`, a `POST` the table marks.
 */
import { describe, expect, it } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { Hono } from 'hono';
import { spec } from '../test/generate';
import { operations as operations31 } from '../test/generated/queries/3.1.0/operations';
import { createRoutes as routes32 } from '../test/generated/queries/3.2.0/hono';
import { operations as operations32 } from '../test/generated/queries/3.2.0/operations';

type PathItem = Record<string, Record<string, unknown>>;

async function paths(version: string): Promise<Record<string, PathItem>> {
	const document = Bun.YAML.parse(
		await readFile(spec('queries', version), 'utf8'),
	) as { paths: Record<string, PathItem> };
	return document.paths;
}

describe('OpenAPI 3.2', () => {
	it('emits the marked POST as a query operation, without the mark', async () => {
		const search = (await paths('3.2.0'))['/books/search'];
		expect(Object.keys(search ?? {})).toEqual(['query']);
		expect(search?.['query']?.['operationId']).toBe('searchBooks');
		expect(search?.['query']).not.toHaveProperty('x-nxgt-method');
		expect(Object.keys((await paths('3.2.0'))['/books'] ?? {})).toEqual([
			'post',
		]);
	});

	it('generates and serves it as a QUERY', async () => {
		expect(operations32.searchBooks.method).toBe('query');
		expect(operations32.searchBooks).not.toHaveProperty('queryMethod');
		const hono = new Hono();
		routes32(hono, { validateResponses: true }).query('/books/search', (c) =>
			c.json(
				{
					items: [],
					total: c.req.valid('json').titles.length,
					page: 1,
					pageSize: 20,
					pageCount: 0,
				},
				200,
			),
		);
		const reply = await hono.request('/books/search', {
			method: 'QUERY',
			body: JSON.stringify({ titles: ['Dune', 'Emma'] }),
			headers: { 'content-type': 'application/json' },
		});
		expect(reply.status).toBe(200);
		expect(await reply.json()).toMatchObject({ total: 2 });
	});
});

describe('OpenAPI 3.1', () => {
	it('keeps the POST and its mark', async () => {
		const search = (await paths('3.1.0'))['/books/search'];
		expect(Object.keys(search ?? {})).toEqual(['post']);
		expect(search?.['post']?.['x-nxgt-method']).toBe('query');
	});

	it('generates a POST the table marks a QUERY', () => {
		expect(operations31.searchBooks).toMatchObject({
			method: 'post',
			queryMethod: true,
		});
		expect(operations31.createBook).not.toHaveProperty('queryMethod');
	});
});
