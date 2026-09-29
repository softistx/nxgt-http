/**
 * The error replies of `lib/errors.tsp`, compiled from the `errors` fixture,
 * generated, and served by `@nxgt/openapi-hono` with its reply checks on:
 * what the engine and a handler send must be what the library declares.
 */
import { describe, expect, it } from 'bun:test';
import { Hono } from 'hono';
import { VERSIONS } from '../test/generate';
import { createRoutes as routes31 } from '../test/generated/errors/3.1.0/hono';
import type {
	BadRequestBody,
	ConflictBody,
	NotFoundBody,
} from '../test/generated/errors/3.1.0/types';
import { zBadRequestBody as zBadRequestBody31 } from '../test/generated/errors/3.1.0/zod';
import { createRoutes as routes32 } from '../test/generated/errors/3.2.0/hono';
import { zBadRequestBody as zBadRequestBody32 } from '../test/generated/errors/3.2.0/zod';

/** What each version generates: the same code, checked both ways. */
const served = {
	'3.1.0': { createRoutes: routes31, zBadRequestBody: zBadRequestBody31 },
	'3.2.0': { createRoutes: routes32, zBadRequestBody: zBadRequestBody32 },
};
const timestamp = '2026-09-29T08:00:00.000Z';

function app(createRoutes: typeof routes31): Hono {
	const hono = new Hono();
	createRoutes(hono, { validateResponses: true })
		.get('/articles/{id}', (c) => {
			const { id } = c.req.valid('param');
			// Breaks the spec: no timestamp.
			const broken = { status: 404 as const, message: 'errors.not-found' };
			const found: NotFoundBody = { ...broken, timestamp };
			return c.json(id === 'broken' ? (broken as NotFoundBody) : found, 404);
		})
		.put('/articles/{id}', (c) => {
			const { title } = c.req.valid('json');
			if (title === 'taken') {
				const body: ConflictBody = {
					status: 409,
					message: 'errors.conflict',
					timestamp,
				};
				return c.json(body, 409);
			}
			const body: BadRequestBody = {
				status: 400,
				message: 'errors.bad-title',
				timestamp,
			};
			return c.json(body, 400);
		});
	return hono;
}

const put = (createRoutes: typeof routes31, body: unknown) =>
	app(createRoutes).request('/articles/1', {
		method: 'PUT',
		body: JSON.stringify(body),
		headers: { 'content-type': 'application/json' },
	});

for (const version of VERSIONS) {
	describe(`error replies, from OpenAPI ${version}`, () => {
		const { createRoutes, zBadRequestBody } = served[version];

		it('declares the envelope a handler sends, and refuses one that breaks it', async () => {
			const found = await app(createRoutes).request('/articles/1');
			expect(found.status).toBe(404);
			expect(await found.json()).toEqual({
				status: 404,
				message: 'errors.not-found',
				timestamp,
			});
			const broken = await app(createRoutes).request('/articles/broken');
			expect(broken.status).toBe(500);
			expect(await broken.json()).toMatchObject({
				status: 500,
				message: 'errors.response-validation-failed',
			});
		});

		it("types the validators' 400 as BadRequestBody, with its issues", async () => {
			const refused = await put(createRoutes, { id: '1' });
			expect(refused.status).toBe(400);
			const body = await refused.json();
			expect(body.issues).toEqual([
				expect.objectContaining({ target: 'json', path: ['title'] }),
			]);
			expect(zBadRequestBody.safeParse(body).success).toBe(true);
		});

		it("declares a handler's own 400 and 409", async () => {
			const bad = await put(createRoutes, { id: '1', title: 'x' });
			expect(bad.status).toBe(400);
			expect(await bad.json()).toEqual({
				status: 400,
				message: 'errors.bad-title',
				timestamp,
			});
			const conflict = await put(createRoutes, { id: '1', title: 'taken' });
			expect(conflict.status).toBe(409);
		});
	});
}
