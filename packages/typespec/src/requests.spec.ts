/**
 * The request aliases of `lib/requests.tsp`, on the blog fixture: each body
 * is the component `Create<T>Request`, `Update<T>Request` or
 * `Patch<T>Request`, and the generated routes, served by
 * `@nxgt/openapi-hono`, hold a `PUT` to the full body and a `PATCH` to a
 * merge patch.
 */
import { describe, expect, it } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { Hono } from 'hono';
import { spec, VERSIONS } from '../test/generate';
import { createRoutes as routes31 } from '../test/generated/blog/3.1.0/hono';
import type { Post } from '../test/generated/blog/3.1.0/types';
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
		.put('/posts/{postId}', (c) =>
			c.json({ ...post, ...c.req.valid('json') }, 200),
		)
		.patch('/posts/{postId}', (c) => {
			const { title } = c.req.valid('json');
			return c.json({ ...post, title: title ?? post.title }, 200);
		});
	return hono;
}

describe.each([...VERSIONS])(
	'the request aliases, in OpenAPI %s',
	(version) => {
		it('name each body after its model', async () => {
			const document = Bun.YAML.parse(
				await readFile(spec('blog', version), 'utf8'),
			) as {
				components: { schemas: Record<string, unknown> };
				paths: Record<
					string,
					Record<string, { requestBody?: { content: Record<string, unknown> } }>
				>;
			};
			for (const name of [
				'CreatePostRequest',
				'CreateCommentRequest',
				'CreateAuthorRequest',
				'UpdatePostRequest',
				'PatchPostRequest',
				'PatchAuthorRequest',
			]) {
				expect(document.components.schemas).toHaveProperty(name);
			}
			const posts = document.paths['/posts/{postId}'];
			expect(Object.keys(posts?.['put']?.requestBody?.content ?? {})).toEqual([
				'application/json',
			]);
			expect(Object.keys(posts?.['patch']?.requestBody?.content ?? {})).toEqual(
				['application/merge-patch+json'],
			);
		});

		const send = (method: 'PUT' | 'PATCH', body: unknown) =>
			app(served[version]).request(`/posts/${id}`, {
				method,
				body: JSON.stringify(body),
				headers: {
					'content-type':
						method === 'PATCH'
							? 'application/merge-patch+json'
							: 'application/json',
				},
			});

		it('takes the whole body on a PUT, and refuses one without a required property', async () => {
			const full = {
				authorId: id,
				title: 'Replaced',
				body: '',
				status: 'draft',
				version: 3,
			};
			const replaced = await send('PUT', full);
			expect(replaced.status).toBe(200);
			expect(((await replaced.json()) as Post).title).toBe('Replaced');
			const { title: _, ...untitled } = full;
			expect((await send('PUT', untitled)).status).toBe(400);
		});

		it('takes any subset on a PATCH', async () => {
			const patched = await send('PATCH', { title: 'Patched' });
			expect(patched.status).toBe(200);
			expect(((await patched.json()) as Post).title).toBe('Patched');
			expect((await send('PATCH', {})).status).toBe(200);
		});
	},
);
