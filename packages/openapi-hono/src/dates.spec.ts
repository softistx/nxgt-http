/**
 * `dates: 'date'` on a real Hono app: the `dates` fixture's routes hand a
 * handler `Date`s, and send them back as strings.
 */
import { describe, expect, it } from 'bun:test';
import { Hono } from 'hono';
import { createRoutes } from '../test/generated/dates/hono';

const at = (iso: string) => new Date(iso);

describe("dates: 'date'", () => {
	it('hands a handler Dates, and sends its reply with strings', async () => {
		const app = new Hono();
		createRoutes(app, { validateResponses: true }).post('/events', (c) => {
			const body = c.req.valid('json');
			expect(body.startsAt).toBeInstanceOf(Date);
			return c.json(
				{ ...body, id: '1', createdAt: at('2024-04-01T10:00:00Z') },
				201,
			);
		});
		const send = (startsAt: string) =>
			app.request('/events', {
				method: 'POST',
				body: JSON.stringify({ title: 'Launch', startsAt }),
				headers: { 'content-type': 'application/json' },
			});
		const created = await send('2024-05-01T10:00:00Z');
		expect(created.status).toBe(201);
		expect(await created.json()).toMatchObject({
			startsAt: '2024-05-01T10:00:00.000Z',
			createdAt: '2024-04-01T10:00:00.000Z',
		});
		const refused = await send('tomorrow');
		expect(refused.status).toBe(400);
	});
});
