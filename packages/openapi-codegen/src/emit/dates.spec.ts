/**
 * `dates: 'date'`, run: the `dates` fixture's validators decode date-times to
 * `Date`s, and its Hono routes hand them to handlers and send them back as
 * strings.
 */
import { describe, expect, it } from 'bun:test';
import { Hono } from 'hono';
import { z } from 'zod';
import { createRoutes } from '../../test/generated/dates/hono.gen';
import {
	operations,
	zRescheduleEventForm,
} from '../../test/generated/dates/operations.gen';
import * as D from '../../test/generated/dates/zod.gen';

const at = (iso: string) => new Date(iso);

describe("dates: 'date'", () => {
	it('decodes a date-time to a Date, fills a default, and leaves a day a string', () => {
		const event = D.zNewEvent.parse({
			title: 'Launch',
			startsAt: '2024-05-01T10:00:00+02:00',
			endsAt: null,
			day: '2024-05-01',
		});
		expect(event).toEqual({
			title: 'Launch',
			startsAt: at('2024-05-01T08:00:00Z'),
			endsAt: null,
			remindAt: at('2024-01-01T09:00:00Z'),
			day: '2024-05-01',
		});
	});

	it('takes JSON: a date-time without its offset, and a Date itself, are refused', () => {
		expect(D.zTimestamp.safeParse('2024-05-01T10:00:00').success).toBe(false);
		expect(D.zTimestamp.safeParse(new Date()).success).toBe(false);
	});

	it('encodes a decoded value back to what JSON carries', () => {
		const event = D.zEvent.parse({
			id: '1',
			title: 'Launch',
			startsAt: '2024-05-01T10:00:00Z',
			createdAt: '2024-04-01T10:00:00Z',
			history: ['2024-04-02T10:00:00Z'],
		});
		expect(z.encode(D.zEvent, event)).toEqual({
			id: '1',
			title: 'Launch',
			startsAt: '2024-05-01T10:00:00.000Z',
			remindAt: '2024-01-01T09:00:00.000Z',
			createdAt: '2024-04-01T10:00:00.000Z',
			history: ['2024-04-02T10:00:00.000Z'],
		});
	});

	it('reads a date-time from a query and from a form', () => {
		expect(
			operations.listEvents.query.parse({ since: '2024-05-01T10:00:00Z' }),
		).toEqual({ since: at('2024-05-01T10:00:00Z') });
		expect(
			zRescheduleEventForm.parse({
				at: '2024-05-01T10:00:00Z',
				notify: '2024-04-30T10:00:00Z',
			}),
		).toEqual({
			at: at('2024-05-01T10:00:00Z'),
			notify: [at('2024-04-30T10:00:00Z')],
		});
	});

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
