/**
 * `Resource` and `SortParameters`, from `lib/resources.tsp`, on the blog
 * fixture's authors, served by `@nxgt/openapi-hono` with its checks on: the
 * five operations, the filters the spec writes, and a sort by one of the
 * fields it names. `test/programs/integer-resource.tsp` is compiled without
 * emitting.
 */
import { describe, expect, it } from 'bun:test';
import { fileURLToPath } from 'node:url';
import { compile, NodeHost, navigateProgram } from '@typespec/compiler';
import { getOperationId } from '@typespec/openapi';
import { Hono } from 'hono';
import { VERSIONS } from '../test/generate';
import { createRoutes as routes31 } from '../test/generated/blog/3.1.0/hono';
import type { Author, AuthorPage } from '../test/generated/blog/3.1.0/types';
import { createRoutes as routes32 } from '../test/generated/blog/3.2.0/hono';

const served = { '3.1.0': routes31, '3.2.0': routes32 };
const id = '5d4c3b2a-1f0e-4d9c-8b7a-6e5f4d3c2b1a';
const timestamp = '2026-09-29T08:00:00.000Z';
const ada: Author = {
	id,
	name: 'Ada',
	email: 'ada@example.com',
	createdAt: timestamp,
	updatedAt: timestamp,
};

function app(createRoutes: typeof routes31): Hono {
	const hono = new Hono();
	createRoutes(hono, { validateResponses: true })
		.get('/authors', (c) => {
			const { name, orderBy, direction, page, pageSize } = c.req.valid('query');
			const items = name === undefined || name === ada.name ? [ada] : [];
			const body: AuthorPage = {
				items,
				total: items.length,
				page,
				pageSize,
				pageCount: items.length === 0 ? 0 : 1,
			};
			c.header('x-sorted-by', `${orderBy ?? 'id'} ${direction}`);
			return c.json(body, 200);
		})
		.get('/authors/{id}', (c) => {
			if (c.req.valid('param').id === id) return c.json(ada, 200);
			return c.json(
				{ status: 404 as const, message: 'errors.not-found', timestamp },
				404,
			);
		})
		.post('/authors', (c) => c.json({ ...ada, ...c.req.valid('json') }, 201))
		.patch('/authors/{id}', (c) =>
			c.json({ ...ada, ...c.req.valid('json') }, 200),
		)
		.delete('/authors/{id}', (c) => c.body(null, 204));
	return hono;
}

const call = (
	createRoutes: typeof routes31,
	method: string,
	path: string,
	body?: unknown,
) =>
	app(createRoutes).request(path, {
		method,
		...(body === undefined
			? {}
			: {
					body: JSON.stringify(body),
					headers: {
						'content-type':
							method === 'PATCH'
								? 'application/merge-patch+json'
								: 'application/json',
					},
				}),
	});

for (const version of VERSIONS) {
	describe(`resources, from OpenAPI ${version}`, () => {
		const createRoutes = served[version];

		it('lists with the filters the spec writes, and a sort by a field it names', async () => {
			const sorted = await call(
				createRoutes,
				'GET',
				'/authors?name=Ada&orderBy=name&direction=desc',
			);
			expect(sorted.status).toBe(200);
			expect(sorted.headers.get('x-sorted-by')).toBe('name desc');
			expect(await sorted.json()).toMatchObject({
				items: [{ name: 'Ada' }],
				total: 1,
			});
			const plain = await call(createRoutes, 'GET', '/authors');
			expect(plain.headers.get('x-sorted-by')).toBe('id asc');
		});

		it('refuses a sort by another field, or another direction', async () => {
			expect(
				(await call(createRoutes, 'GET', '/authors?orderBy=email')).status,
			).toBe(400);
			expect(
				(await call(createRoutes, 'GET', '/authors?direction=up')).status,
			).toBe(400);
		});

		it('reads, creates, updates and deletes', async () => {
			expect((await call(createRoutes, 'GET', `/authors/${id}`)).status).toBe(
				200,
			);
			const created = await call(createRoutes, 'POST', '/authors', {
				name: 'Grace',
				email: 'grace@example.com',
			});
			expect(created.status).toBe(201);
			expect(await created.json()).toMatchObject({ name: 'Grace' });
			const updated = await call(createRoutes, 'PATCH', `/authors/${id}`, {
				name: 'Ada L.',
			});
			expect(await updated.json()).toMatchObject({ name: 'Ada L.' });
			expect(
				(await call(createRoutes, 'DELETE', `/authors/${id}`)).status,
			).toBe(204);
		});
	});
}

it('takes another id type, as id("identity")', async () => {
	const main = fileURLToPath(
		new URL('../test/programs/integer-resource.tsp', import.meta.url),
	);
	const program = await compile(NodeHost, main, { noEmit: true });
	expect(program.diagnostics).toEqual([]);
	const ids: string[] = [];
	navigateProgram(program, {
		operation(operation) {
			const path = operation.parameters.properties.get('id')?.type;
			ids.push(
				`${getOperationId(program, operation)}:${path?.kind === 'Scalar' ? path.name : '-'}`,
			);
		},
	});
	expect(ids.sort()).toEqual([
		'createTags:-',
		'deleteTags:integer',
		'listTags:-',
		'readTags:integer',
		'updateTags:integer',
	]);
}, 30_000);
