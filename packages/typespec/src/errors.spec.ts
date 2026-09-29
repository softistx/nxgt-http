/**
 * The error replies of `lib/errors.tsp`, compiled from the `errors` fixture,
 * generated, and served by `@nxgt/openapi-hono` with its reply checks on:
 * what the engine and a handler send must be what the library declares.
 */
import { describe, expect, it } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { generateFiles } from '@nxgt/openapi-codegen';
import { Hono } from 'hono';
import { emitted, project } from '../test/generate';
import { createRoutes } from '../test/generated/errors/hono';
import type {
	BadRequestBody,
	ConflictBody,
	NotFoundBody,
} from '../test/generated/errors/types';
import { zBadRequestBody } from '../test/generated/errors/zod';

const yaml = `${project('errors')}openapi.yaml`;
const timestamp = '2026-09-29T08:00:00.000Z';

function app(): Hono {
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

const put = (body: unknown) =>
	app().request('/articles/1', {
		method: 'PUT',
		body: JSON.stringify(body),
		headers: { 'content-type': 'application/json' },
	});

describe('error replies', () => {
	it('is what errors/main.tsp compiles to: `bun run fixtures:typespec` accepts a change', async () => {
		expect(await emitted('errors')).toBe(await readFile(yaml, 'utf8'));
	}, 30_000);

	it('generates with no warning', async () => {
		const { warnings } = await generateFiles({
			input: yaml,
			output: '/unused',
			hono: true,
		});
		expect(warnings).toEqual([]);
	});

	it('declares the envelope a handler sends, and refuses one that breaks it', async () => {
		const found = await app().request('/articles/1');
		expect(found.status).toBe(404);
		expect(await found.json()).toEqual({
			status: 404,
			message: 'errors.not-found',
			timestamp,
		});
		const broken = await app().request('/articles/broken');
		expect(broken.status).toBe(500);
		expect(await broken.json()).toMatchObject({
			status: 500,
			message: 'errors.response-validation-failed',
		});
	});

	it("types the validators' 400 as BadRequestBody, with its issues", async () => {
		const refused = await put({ id: '1' });
		expect(refused.status).toBe(400);
		const body = await refused.json();
		expect(body.issues).toEqual([
			expect.objectContaining({ target: 'json', path: ['title'] }),
		]);
		expect(zBadRequestBody.safeParse(body).success).toBe(true);
	});

	it("declares a handler's own 400 and 409", async () => {
		const bad = await put({ id: '1', title: 'x' });
		expect(bad.status).toBe(400);
		expect(await bad.json()).toEqual({
			status: 400,
			message: 'errors.bad-title',
			timestamp,
		});
		const conflict = await put({ id: '1', title: 'taken' });
		expect(conflict.status).toBe(409);
	});
});
