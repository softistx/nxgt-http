/**
 * `streamEvents()` and `streamLines()` on a real Hono app, bound to the
 * `streams` fixture by its generated `hono.ts`.
 */
import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import { type Context, Hono } from 'hono';
import {
	createRoutes,
	streamEvents,
	streamLines,
} from '../test/generated/streams/hono';
import type { ValidationFailure } from './index';

const AT = '2026-09-14T10:00:00.000Z';
const item = { id: 'a', name: 'first', updatedAt: new Date(AT) };

const failures: ValidationFailure[] = [];
const logged = spyOn(console, 'error').mockImplementation(() => {});
afterEach(() => {
	failures.length = 0;
	logged.mockClear();
});

const app = new Hono();
createRoutes(app, {
	validateResponses: true,
	onValidationError: (failure) => {
		failures.push(failure);
		return undefined;
	},
})
	.get('/feed', (c) =>
		streamEvents(c, 'watchFeed', async (stream) => {
			const { topic } = c.req.valid('query');
			await stream.write({ event: 'update', id: '7', data: item });
			await stream.write({ event: 'ping', data: 'still here' });
			if (topic === 'bad') {
				// What the types refuse, as a handler with an `any` might send it.
				await stream.write({ event: 'removed', data: { id: 1 } } as never);
				await stream.write({ event: 'ping', data: 'never sent' });
			}
			if (topic === 'undeclared') {
				await stream.write({ event: 'other', data: 'x' } as never);
			}
			if (topic === 'misplaced') {
				await streamEvents(c, 'tailLogs', async () => {});
			}
		}),
	)
	.get('/logs', (c) =>
		streamEvents(c, 'tailLogs', async (stream) => {
			await stream.write({ data: 'line 1' });
			await stream.write({ event: 'custom', data: 'two\nlines', retry: 1000 });
		}),
	)
	.post('/export', (c) =>
		streamLines(c, 'exportItems', async (stream) => {
			await stream.write(item);
			await stream.write({ id: 'b', name: 'second' });
		}),
	);

const read = async (path: string, init?: RequestInit) => {
	const response = await app.request(path, init);
	return { response, text: await response.text() };
};

describe('streamEvents', () => {
	it("sends the operation's events, JSON data as JSON and text as it is", async () => {
		const { response, text } = await read('/feed?topic=news');
		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toBe('text/event-stream');
		expect(text).toBe(
			[
				'event: update',
				`data: {"id":"a","name":"first","updatedAt":"${AT}"}`,
				'id: 7',
				'',
				'event: ping',
				'data: still here',
				'',
				'',
			].join('\n'),
		);
		expect(failures).toEqual([]);
	});

	it('sends any event, as text, where the spec declares none', async () => {
		const { text } = await read('/logs');
		expect(text).toBe(
			[
				'data: line 1',
				'',
				'event: custom',
				'data: two',
				'data: lines',
				'retry: 1000',
				'',
				'',
			].join('\n'),
		);
	});

	it('ends the stream before an event the spec does not declare, with validateResponses', async () => {
		const { response, text } = await read('/feed?topic=bad');
		// The status went out with the first event.
		expect(response.status).toBe(200);
		expect(text).toContain('still here');
		expect(text).not.toContain('removed');
		expect(text).not.toContain('never sent');
		expect(failures).toMatchObject([
			{
				kind: 'response',
				operationId: 'watchFeed',
				status: 200,
				issues: [{ target: 'response', path: ['id'] }],
			},
		]);
		expect(logged).toHaveBeenCalled();
	});

	it('refuses an event name the spec does not know', async () => {
		const { text } = await read('/feed?topic=undeclared');
		expect(text).not.toContain('other');
		expect(String(logged.mock.calls[0]?.[0])).toContain(
			'watchFeed declares no `other` event',
		);
	});

	it("refuses to stream another operation's reply", async () => {
		const { response } = await read('/feed?topic=misplaced');
		expect(response.status).toBe(200);
		expect(String(logged.mock.calls[0]?.[0])).toContain(
			'tailLogs: stream its reply from the handler of its own route',
		);
	});
});

describe('streamLines', () => {
	it('sends a line of JSON per item, as the media type the spec declares', async () => {
		const { response, text } = await read('/export', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: '{}',
		});
		expect(response.headers.get('content-type')).toBe('application/jsonl');
		expect(text).toBe(
			`{"id":"a","name":"first","updatedAt":"${AT}"}\n{"id":"b","name":"second"}\n`,
		);
		expect(failures).toEqual([]);
	});
});

export function types(c: Context): void {
	createRoutes(new Hono()).get('/feed', (c) =>
		streamEvents(c, 'watchFeed', async (stream) => {
			// @ts-expect-error an event the spec does not declare
			await stream.write({ event: 'other', data: 'x' });
			// @ts-expect-error `update` carries an Item
			await stream.write({ event: 'update', data: 'x' });
		}),
	);
	// @ts-expect-error exportItems replies with JSON lines, not events
	streamEvents(c, 'exportItems', async () => {});
	// @ts-expect-error watchFeed replies with events, not lines
	streamLines(c, 'watchFeed', async () => {});
}
