/**
 * `dates: 'date'`, run: the `dates` fixture's validators decode date-times to
 * `Date`s, and encode them back. Its Hono routes are `@nxgt/openapi-hono`'s
 * to run, in its `src/dates.spec.ts`.
 */
import { describe, expect, it } from 'bun:test';
import { z } from 'zod';
import {
	operations,
	zRescheduleEventForm,
} from '../../test/generated/dates/operations';
import * as D from '../../test/generated/dates/zod';

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
});
