/**
 * The pagination of `lib/pagination.tsp`, on the blog fixture's post list
 * (offset) and comment list (cursor), served by `@nxgt/openapi-hono` with
 * reply checks on: the query arrives checked and with its defaults, and a
 * page is what `@nxgt/drizzle` returns.
 */
import { describe, expect, it } from 'bun:test';
import { Hono } from 'hono';
import { VERSIONS } from '../test/generate';
import { createRoutes as routes31 } from '../test/generated/blog/3.1.0/hono';
import type {
	CommentCursorPage,
	PostPage,
} from '../test/generated/blog/3.1.0/types';
import { createRoutes as routes32 } from '../test/generated/blog/3.2.0/hono';

const served = { '3.1.0': routes31, '3.2.0': routes32 };
const post = '0b8e5c1e-2f4a-4c3b-9d6e-7f8a9b0c1d2e';

function app(createRoutes: typeof routes31): Hono {
	const hono = new Hono();
	createRoutes(hono, { validateResponses: true })
		.get('/posts', (c) => {
			const { page, pageSize } = c.req.valid('query');
			// A page past the last: no item, and a total that says so.
			const body: PostPage = {
				items: [],
				total: 3,
				page,
				pageSize,
				pageCount: Math.ceil(3 / pageSize),
			};
			return c.json(body, 200);
		})
		.get('/posts/{postId}/comments', (c) => {
			const { after, limit } = c.req.valid('query');
			const body: CommentCursorPage = {
				items: [],
				nextCursor: after === undefined ? `after-${limit}` : null,
			};
			return c.json(body, 200);
		});
	return hono;
}

for (const version of VERSIONS) {
	describe(`pagination, from OpenAPI ${version}`, () => {
		const createRoutes = served[version];

		it('fills in page 1 of 20 items, and reads the ones given', async () => {
			const first = await app(createRoutes).request('/posts');
			expect(first.status).toBe(200);
			expect(await first.json()).toEqual({
				items: [],
				total: 3,
				page: 1,
				pageSize: 20,
				pageCount: 1,
			});
			const third = await app(createRoutes).request('/posts?page=3&pageSize=1');
			expect(await third.json()).toMatchObject({
				page: 3,
				pageSize: 1,
				pageCount: 3,
			});
		});

		it('refuses a page or a pageSize below 1', async () => {
			for (const query of ['page=0', 'pageSize=0']) {
				const refused = await app(createRoutes).request(`/posts?${query}`);
				expect(refused.status).toBe(400);
			}
		});

		it('pages by cursor, with a null nextCursor on the last page', async () => {
			const first = await app(createRoutes).request(`/posts/${post}/comments`);
			expect(await first.json()).toEqual({ items: [], nextCursor: 'after-20' });
			const last = await app(createRoutes).request(
				`/posts/${post}/comments?after=after-20&limit=5`,
			);
			expect(await last.json()).toEqual({ items: [], nextCursor: null });
			const refused = await app(createRoutes).request(
				`/posts/${post}/comments?limit=0`,
			);
			expect(refused.status).toBe(400);
		});
	});
}
