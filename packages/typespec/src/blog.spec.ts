/**
 * The blog example, split across files: its comment routes served by
 * `@nxgt/openapi-hono` with reply checks on, from both OpenAPI versions.
 */
import { describe, expect, it } from 'bun:test';
import { Hono } from 'hono';
import { VERSIONS } from '../test/generate';
import { createRoutes as routes31 } from '../test/generated/blog/3.1.0/hono';
import type { Comment, NotFoundBody } from '../test/generated/blog/3.1.0/types';
import { createRoutes as routes32 } from '../test/generated/blog/3.2.0/hono';

const served = { '3.1.0': routes31, '3.2.0': routes32 };
const post = '0b8e5c1e-2f4a-4c3b-9d6e-7f8a9b0c1d2e';
const author = '5d4c3b2a-1f0e-4d9c-8b7a-6e5f4d3c2b1a';
const timestamp = '2026-09-29T08:00:00.000Z';

function app(createRoutes: typeof routes31): Hono {
	const hono = new Hono();
	createRoutes(hono, { validateResponses: true })
		.get('/posts/{postId}/comments', (c) => {
			const body: NotFoundBody = {
				status: 404,
				message: 'errors.not-found',
				timestamp,
			};
			return c.json(body, 404);
		})
		.post('/posts/{postId}/comments', (c) => {
			const comment: Comment = {
				...c.req.valid('json'),
				id: '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d',
				postId: c.req.valid('param').postId,
				createdAt: timestamp,
				updatedAt: timestamp,
				deletedAt: null,
			};
			return c.json(comment, 201);
		});
	return hono;
}

for (const version of VERSIONS) {
	describe(`the blog example, from OpenAPI ${version}`, () => {
		const createRoutes = served[version];

		it('answers a nested route, and its NotFound', async () => {
			const missing = await app(createRoutes).request(
				`/posts/${post}/comments`,
			);
			expect(missing.status).toBe(404);
		});

		it('creates a comment from Create<Comment>, and refuses an empty one', async () => {
			const send = (body: unknown) =>
				app(createRoutes).request(`/posts/${post}/comments`, {
					method: 'POST',
					body: JSON.stringify(body),
					headers: { 'content-type': 'application/json' },
				});
			const created = await send({ authorId: author, body: 'Nice post.' });
			expect(created.status).toBe(201);
			expect(await created.json()).toMatchObject({ postId: post });
			expect((await send({ authorId: author, body: '' })).status).toBe(400);
		});
	});
}

describe.each([...VERSIONS])('searchAuthors, in OpenAPI %s', (version) => {
	it('is a POST the generated table marks a QUERY', async () => {
		const { operations } = await import(
			`../test/generated/blog/${version}/operations`
		);
		expect(operations.searchAuthors).toMatchObject({
			method: 'post',
			path: '/authors/search',
			queryMethod: true,
		});
		expect(operations.createAuthor.queryMethod).toBeUndefined();
	});
});
