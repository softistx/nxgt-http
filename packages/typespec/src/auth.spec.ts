/**
 * The replies of `lib/auth.tsp`, on the blog fixture's protected routes,
 * served by `@nxgt/openapi-hono` with its reply checks on. The handlers stand
 * in for the `@nxgt/janus` guards: a refusal without a body is what the spec
 * declares. A body where it declares none is refused by the generated types,
 * not at run time: `@nxgt/openapi-hono` checks a reply's body only where the
 * spec declares one.
 */
import { describe, expect, it } from 'bun:test';
import { Hono } from 'hono';
import { VERSIONS } from '../test/generate';
import { createRoutes as routes31 } from '../test/generated/blog/3.1.0/hono';
import type { ForbiddenBody } from '../test/generated/blog/3.1.0/types';
import { createRoutes as routes32 } from '../test/generated/blog/3.2.0/hono';

const served = { '3.1.0': routes31, '3.2.0': routes32 };
const post = '0b8e5c1e-2f4a-4c3b-9d6e-7f8a9b0c1d2e';
const comment = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
const timestamp = '2026-09-29T08:00:00.000Z';

function app(createRoutes: typeof routes31): Hono {
	const hono = new Hono();
	createRoutes(hono, { validateResponses: true })
		// As requireUser() and a handler's own check.
		.post('/posts', (c) => {
			if (c.req.header('authorization') === undefined) {
				return c.body(null, 401);
			}
			const body: ForbiddenBody = {
				status: 403,
				message: 'errors.forbidden',
				timestamp,
			};
			return c.json(body, 403);
		})
		// As permission(): each refusal without a body.
		.delete('/posts/{postId}/comments/{commentId}', (c) => {
			switch (c.req.header('authorization')) {
				case undefined:
					return c.body(null, 401);
				case 'Bearer reader':
					return c.body(null, 403);
				case 'Bearer lost':
					return c.body(null, 404);
				default:
					return c.body(null, 204);
			}
		});
	return hono;
}

const remove = (createRoutes: typeof routes31, authorization?: string) =>
	app(createRoutes).request(`/posts/${post}/comments/${comment}`, {
		method: 'DELETE',
		headers: authorization === undefined ? {} : { authorization },
	});

for (const version of VERSIONS) {
	describe(`auth replies, from OpenAPI ${version}`, () => {
		const createRoutes = served[version];

		it("declares the guards' replies without a body", async () => {
			for (const [authorization, status] of [
				[undefined, 401],
				['Bearer reader', 403],
				['Bearer lost', 404],
				['Bearer owner', 204],
			] as const) {
				const reply = await remove(createRoutes, authorization);
				expect(reply.status).toBe(status);
				expect(await reply.text()).toBe('');
			}
		});

		it("keeps a handler's own refusal, with the envelope, beside the guard's", async () => {
			const send = (headers: Record<string, string>) =>
				app(createRoutes).request('/posts', {
					method: 'POST',
					body: JSON.stringify({
						authorId: post,
						title: 'Hello',
						body: '',
						status: 'draft',
					}),
					headers: { 'content-type': 'application/json', ...headers },
				});
			const anonymous = await send({});
			expect(anonymous.status).toBe(401);
			expect(await anonymous.text()).toBe('');
			const reader = await send({ authorization: 'Bearer reader' });
			expect(reader.status).toBe(403);
			expect(await reader.json()).toMatchObject({ status: 403 });
		});

		it('types a 401 with a body as an error', () => {
			const routes = createRoutes(new Hono());
			// @ts-expect-error: the guard's 401 declares no body
			routes.delete('/posts/{postId}/comments/{commentId}', (c) =>
				c.json({ status: 401 }, 401),
			);
		});
	});
}
