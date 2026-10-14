/**
 * `readOnly` properties are the server's: the generated request validator
 * (`readOnly: 'omit'`, the default) accepts a body without them, and the
 * handler gets the body without them. `writeOnly` properties are the
 * client's: the request needs them, and a reply validated with
 * `validateResponses` does not.
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

describe('writeOnly properties', () => {
	it('requires them in the body, and a reply without them passes validation', async () => {
		const app = new Hono();
		createRoutes(app, { validateResponses: true }).post('/users', (c) => {
			const { password: _password, ...user } = c.req.valid('json');
			return c.json(user, 200);
		});
		const created = await post(app, '/users', {
			id: 'u1',
			email: 'a@b.c',
			password: 'hunter2',
		});
		expect(created.status).toBe(200);
		expect(await created.json()).toEqual({ id: 'u1', email: 'a@b.c' });
		expect(
			(await post(app, '/users', { id: 'u1', email: 'a@b.c' })).status,
		).toBe(400);
	});

	it('validates a nested reply, through allOf and in a list, without them', async () => {
		const app = new Hono();
		createRoutes(app, { validateResponses: true }).get('/admins', (c) =>
			c.json([{ id: 'a1', email: 'a@b.c', level: 1 }], 200),
		);
		const response = await app.request('/admins');
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual([
			{ id: 'a1', email: 'a@b.c', level: 1 },
		]);
	});

	it('leaves a schema only replies use without its writeOnly property', async () => {
		const app = new Hono();
		createRoutes(app, { validateResponses: true }).get('/receipts', (c) =>
			c.json({ number: 'r1' }, 200),
		);
		expect((await app.request('/receipts')).status).toBe(200);
	});
});
