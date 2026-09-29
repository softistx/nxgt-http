/**
 * The scalars of `lib/scalars.tsp` and the columns of `lib/columns.tsp`, on
 * the blog fixture, served by `@nxgt/openapi-hono`: a `uuid` or an `email`
 * is checked, the server's columns are read-only, and `version` goes back in
 * an update. `test/programs/actors.tsp` is compiled without emitting.
 */
import { describe, expect, it } from 'bun:test';
import { fileURLToPath } from 'node:url';
import { compile, NodeHost } from '@typespec/compiler';
import { Hono } from 'hono';
import { VERSIONS } from '../test/generate';
import { createRoutes as routes31 } from '../test/generated/blog/3.1.0/hono';
import type {
	Author,
	CreateComment,
	Post,
	PostMergePatchUpdate,
} from '../test/generated/blog/3.1.0/types';
import { createRoutes as routes32 } from '../test/generated/blog/3.2.0/hono';

const served = { '3.1.0': routes31, '3.2.0': routes32 };
const id = '0b8e5c1e-2f4a-4c3b-9d6e-7f8a9b0c1d2e';
const timestamp = '2026-09-29T08:00:00.000Z';

const post: Post = {
	id,
	authorId: id,
	title: 'Hello',
	body: '',
	status: 'draft',
	publishedAt: null,
	createdAt: timestamp,
	updatedAt: timestamp,
	version: 3,
	createdBy: id,
	updatedBy: null,
	deletedBy: null,
};

function app(createRoutes: typeof routes31): Hono {
	const hono = new Hono();
	createRoutes(hono, { validateResponses: true })
		.post('/authors', (c) => {
			const author: Author = {
				...c.req.valid('json'),
				id,
				createdAt: timestamp,
				updatedAt: timestamp,
			};
			return c.json(author, 201);
		})
		.get('/posts', (c) => {
			const { page, pageSize } = c.req.valid('query');
			return c.json(
				{ items: [post], total: 1, page, pageSize, pageCount: 1 },
				200,
			);
		})
		.patch('/posts/{postId}', (c) => {
			const { version } = c.req.valid('json');
			return c.json({ ...post, version: (version ?? post.version) + 1 }, 200);
		});
	return hono;
}

const send = (
	createRoutes: typeof routes31,
	method: string,
	path: string,
	body: unknown,
) =>
	app(createRoutes).request(path, {
		method,
		body: JSON.stringify(body),
		headers: {
			'content-type':
				method === 'PATCH'
					? 'application/merge-patch+json'
					: 'application/json',
		},
	});

for (const version of VERSIONS) {
	describe(`scalars and columns, from OpenAPI ${version}`, () => {
		const createRoutes = served[version];

		it('checks an email, and fills in the read-only columns on the server', async () => {
			const created = await send(createRoutes, 'POST', '/authors', {
				name: 'Ada',
				email: 'ada@example.com',
			});
			expect(created.status).toBe(201);
			expect(await created.json()).toMatchObject({ id, createdAt: timestamp });
			const refused = await send(createRoutes, 'POST', '/authors', {
				name: 'Ada',
				email: 'not an address',
			});
			expect(refused.status).toBe(400);
		});

		it('checks a uuid in the path and the query', async () => {
			const refused = await send(createRoutes, 'PATCH', '/posts/42', {});
			expect(refused.status).toBe(400);
			const query = await app(createRoutes).request('/posts?authorId=42');
			expect(query.status).toBe(400);
		});

		it('takes the version back in an update', async () => {
			const updated = await send(createRoutes, 'PATCH', `/posts/${id}`, {
				title: 'Again',
				version: 3,
			});
			expect(updated.status).toBe(200);
			expect(await updated.json()).toMatchObject({ version: 4 });
			const refused = await send(createRoutes, 'PATCH', `/posts/${id}`, {
				version: -1,
			});
			expect(refused.status).toBe(400);
		});
	});
}

it('leaves the read-only columns out of what a client sends', () => {
	// @ts-expect-error: createdAt is the server's
	const created: keyof CreateComment = 'createdAt';
	// @ts-expect-error: createdBy is the server's
	const stamped: keyof PostMergePatchUpdate = 'createdBy';
	// @ts-expect-error: deletedAt is the server's
	const deleted: keyof CreateComment = 'deletedAt';
	// @ts-expect-error: updatedAt is the server's
	const touched: keyof PostMergePatchUpdate = 'updatedAt';
	const locked: keyof PostMergePatchUpdate = 'version';
	expect([created, stamped, deleted, touched, locked]).toHaveLength(5);
});

it('types the actors with another id, as actors("integer")', async () => {
	const main = fileURLToPath(
		new URL('../test/programs/actors.tsp', import.meta.url),
	);
	const program = await compile(NodeHost, main, { noEmit: true });
	expect(program.diagnostics).toEqual([]);
	const order = program
		.getGlobalNamespaceType()
		.namespaces.get('Shop')
		?.models.get('Order');
	const createdBy = order?.properties.get('createdBy')?.type;
	expect(createdBy?.kind).toBe('Union');
	const variants =
		createdBy?.kind === 'Union'
			? [...createdBy.variants.values()].map(({ type }) =>
					type.kind === 'Scalar' ? type.name : type.kind,
				)
			: [];
	expect(variants).toEqual(['integer', 'Intrinsic']);
}, 30_000);
