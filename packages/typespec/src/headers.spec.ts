/**
 * The headers of `lib/headers.tsp`, on the blog fixture's post creation,
 * served by `@nxgt/openapi-hono` with its checks on: the `Idempotency-Key`
 * arrives checked, and the replies carry `Idempotent-Replayed`, the
 * `RateLimit-*` headers and `Retry-After` as the spec declares them.
 */
import { describe, expect, it } from 'bun:test';
import { Hono } from 'hono';
import { VERSIONS } from '../test/generate';
import { createRoutes as routes31 } from '../test/generated/blog/3.1.0/hono';
import type {
	ConflictBody,
	Post,
	TooManyRequestsBody,
	UnprocessableEntityBody,
} from '../test/generated/blog/3.1.0/types';
import { createRoutes as routes32 } from '../test/generated/blog/3.2.0/hono';

const served = { '3.1.0': routes31, '3.2.0': routes32 };
const id = '0b8e5c1e-2f4a-4c3b-9d6e-7f8a9b0c1d2e';
const timestamp = '2026-09-29T08:00:00.000Z';

/** Keys this stand-in store has seen: one written, one still running. */
function app(createRoutes: typeof routes31): Hono {
	const hono = new Hono();
	createRoutes(hono, { validateResponses: true }).post('/posts', (c) => {
		const key = c.req.valid('header')['idempotency-key'];
		c.header('RateLimit-Limit', '5');
		c.header('RateLimit-Remaining', '4');
		c.header('RateLimit-Reset', '60');
		if (key === 'running') {
			const body: ConflictBody = {
				status: 409,
				message: 'errors.in-progress',
				timestamp,
			};
			c.header('Retry-After', '1');
			return c.json(body, 409);
		}
		if (key === 'reused') {
			const body: UnprocessableEntityBody = {
				status: 422,
				message: 'errors.idempotency-key-reused',
				timestamp,
			};
			return c.json(body, 422);
		}
		if (key === 'spent') {
			const body: TooManyRequestsBody = {
				status: 429,
				message: 'errors.rate-limited',
				timestamp,
			};
			c.header('RateLimit-Remaining', '0');
			c.header('Retry-After', '30');
			return c.json(body, 429);
		}
		const post: Post = {
			...c.req.valid('json'),
			id,
			publishedAt: null,
			createdAt: timestamp,
			updatedAt: timestamp,
			version: 0,
			createdBy: id,
			updatedBy: id,
			deletedBy: null,
		};
		if (key === 'written') c.header('Idempotent-Replayed', 'true');
		return c.json(post, 201);
	});
	return hono;
}

const create = (createRoutes: typeof routes31, key?: string) =>
	app(createRoutes).request('/posts', {
		method: 'POST',
		body: JSON.stringify({
			authorId: id,
			title: 'Hello',
			body: '',
			status: 'draft',
		}),
		headers: {
			'content-type': 'application/json',
			authorization: 'Bearer writer',
			...(key === undefined ? {} : { 'idempotency-key': key }),
		},
	});

for (const version of VERSIONS) {
	describe(`headers, from OpenAPI ${version}`, () => {
		const createRoutes = served[version];

		it('takes an Idempotency-Key of 1 to 255 characters, or none', async () => {
			expect((await create(createRoutes)).status).toBe(201);
			expect((await create(createRoutes, 'k'.repeat(255))).status).toBe(201);
			expect((await create(createRoutes, '')).status).toBe(400);
			expect((await create(createRoutes, 'k'.repeat(256))).status).toBe(400);
		});

		it('replays a write, with Idempotent-Replayed and the rate limit', async () => {
			const replayed = await create(createRoutes, 'written');
			expect(replayed.status).toBe(201);
			expect(replayed.headers.get('idempotent-replayed')).toBe('true');
			expect(replayed.headers.get('ratelimit-remaining')).toBe('4');
		});

		it('answers a running key, a reused key and a spent limit', async () => {
			const running = await create(createRoutes, 'running');
			expect(running.status).toBe(409);
			expect(running.headers.get('retry-after')).toBe('1');
			expect((await create(createRoutes, 'reused')).status).toBe(422);
			const spent = await create(createRoutes, 'spent');
			expect(spent.status).toBe(429);
			expect(spent.headers.get('retry-after')).toBe('30');
		});
	});
}
