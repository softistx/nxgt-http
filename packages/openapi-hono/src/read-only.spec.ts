/**
 * `readOnly` properties are the server's: the generated request validator
 * (`readOnly: 'omit'`, the default) accepts a body without them, and the
 * handler gets the body without them.
 */
import { describe, expect, it } from 'bun:test';
import { Hono } from 'hono';
import { createRoutes } from '../test/generated/read-only/hono';

const post = (app: Hono, path: string, body: unknown) =>
	app.request(path, {
		method: 'POST',
		body: JSON.stringify(body),
		headers: { 'content-type': 'application/json' },
	});

describe('readOnly properties', () => {
	it('accepts a body without them, and a handler sees none', async () => {
		const app = new Hono();
		createRoutes(app, { validateResponses: true }).post('/pets', (c) => {
			const body = c.req.valid('json');
			expect('id' in body).toBe(false);
			return c.json(
				{
					...body,
					owner: { id: 'o1', name: 'Ann' },
					id: '3f2c1f0e-7d2a-4f7e-8f55-0c4d6a1b9e10',
					createdAt: new Date('2024-04-01T10:00:00Z'),
				},
				200,
			);
		});
		const created = await post(app, '/pets', { name: 'Rex' });
		expect(created.status).toBe(200);
		expect(await created.json()).toMatchObject({
			name: 'Rex',
			status: 'available',
			createdAt: '2024-04-01T10:00:00.000Z',
		});
	});

	it('drops one sent anyway, nested and in an array too', async () => {
		const app = new Hono();
		createRoutes(app)
			.post('/pets', (c) => {
				const body = c.req.valid('json');
				expect(body).not.toHaveProperty('id');
				expect(body.owner).toEqual({ name: 'Ann' });
				return c.body(null, 200) as never;
			})
			.post('/pets/batch', (c) => {
				expect(c.req.valid('json')).toEqual([
					expect.not.objectContaining({ id: expect.anything() }),
				]);
				return c.body(null, 204);
			});
		expect(
			(
				await post(app, '/pets', {
					id: 'x',
					name: 'Rex',
					owner: { id: 'o', name: 'Ann' },
				})
			).status,
		).toBe(200);
		expect((await post(app, '/pets/batch', [{ name: 'Rex' }])).status).toBe(
			204,
		);
	});

	it('still refuses a body without a required, writable property', async () => {
		const app = new Hono();
		createRoutes(app).post('/pets', (c) => c.body(null, 200) as never);
		expect((await post(app, '/pets', {})).status).toBe(400);
	});
});
