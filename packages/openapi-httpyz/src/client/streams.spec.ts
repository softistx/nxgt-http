/**
 * `api.stream()`: an operation's events or JSON lines, read from a Hono app
 * served in-process as the client's `fetch`.
 */
import { describe, expect, it } from 'bun:test';
import {
	createHttpClient,
	type ServerEvent,
	ValidationError,
} from '@nxgt/httpyz';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { operations as dated } from '../../test/generated/dates/operations';
import type { ClientOperations as DatedOperations } from '../../test/generated/dates/types';
import { operations } from '../../test/generated/operations';
import type {
	ClientOperations,
	OperationsByRoute,
} from '../../test/generated/types';
import { createOpenApiClient } from '../index';

const CREATED = '2026-09-14T10:00:00.000Z';

const app = new Hono()
	.get('/feed', (c) =>
		streamSSE(c, async (s) => {
			await s.writeSSE({
				event: 'added',
				id: '1',
				data: JSON.stringify({
					id: 1,
					name: c.req.query('topic') ?? '',
					createdAt: CREATED,
				}),
			});
			await s.writeSSE({ event: 'other', data: 'undeclared' });
			await s.writeSSE({ event: 'note', data: 'plain text' });
		}),
	)
	.post('/export', async (c) => {
		const { limit = 2 } = await c.req.json<{ limit?: number }>();
		const lines = Array.from({ length: limit }, (_, i) =>
			JSON.stringify(i === 2 ? { id: 'three' } : { id: i, name: `item ${i}` }),
		);
		return c.body(`${lines.join('\n')}\n`, 200, {
			'content-type': 'application/jsonl',
		});
	});

/** Every request the client sent. */
const sent: Request[] = [];
const http = createHttpClient({
	baseUrl: 'http://api.test',
	fetch: async (request) => {
		sent.push(request.clone());
		return app.fetch(request);
	},
});

const collect = async <T>(stream: AsyncIterable<T>): Promise<T[]> => {
	const items: T[] = [];
	for await (const item of stream) items.push(item);
	return items;
};

describe('api.stream', () => {
	it('reads the events the spec declares, each narrowed on its name', async () => {
		const api = createOpenApiClient<ClientOperations, OperationsByRoute>(
			http,
			operations,
		);
		const unknown: ServerEvent[] = [];
		const feed = api.stream(
			'watchFeed',
			{ query: { topic: 'news' } },
			{ reconnect: false, onUnknownEvent: (event) => unknown.push(event) },
		);
		const names: string[] = [];
		for await (const event of feed) {
			if (event.event === 'added') {
				// As JSON carries it: the client does not decode.
				const created: string | undefined = event.data.createdAt;
				expect(event.data.name).toBe('news');
				expect(created).toBe(CREATED);
				expect(event.id).toBe('1');
			} else {
				const text: string = event.data;
				expect(text).toBe('plain text');
			}
			names.push(event.event);
		}
		expect(names).toEqual(['added', 'note']);
		expect(unknown.map((event) => event.event)).toEqual(['other']);
		expect(feed.lastEventId).toBe('1');
		const request = sent.at(-1);
		expect(new URL(request?.url ?? '').search).toBe('?topic=news');
		expect(request?.headers.get('accept')).toBe('text/event-stream');
	});

	it('decodes each event as its schema outputs it', async () => {
		const api = createOpenApiClient<
			DatedOperations,
			Record<never, never>,
			true
		>(http, dated, { decode: true });
		for await (const event of api.stream(
			'watchFeed',
			{ query: { topic: 'x' } },
			{ reconnect: false },
		)) {
			if (event.event !== 'added') continue;
			const created: Date | undefined = event.data.createdAt;
			expect(created).toEqual(new Date(CREATED));
		}
	});

	it('reads JSON lines, with the body and the Accept the spec declares', async () => {
		const api = createOpenApiClient<ClientOperations, OperationsByRoute>(
			http,
			operations,
		);
		const items = await collect(
			api.stream('exportItems', { json: { limit: 2 } }),
		);
		expect(items.map((item) => item.name)).toEqual(['item 0', 'item 1']);
		expect(sent.at(-1)?.headers.get('accept')).toBe('application/jsonl');
		expect(await sent.at(-1)?.json()).toEqual({ limit: 2 });
	});

	it('checks each line with `validate`', async () => {
		const api = createOpenApiClient<ClientOperations, OperationsByRoute>(
			http,
			operations,
			{ validate: { response: true } },
		);
		const error = await collect(
			api.stream('exportItems', { json: { limit: 3 } }),
		).catch((e: unknown) => e);
		expect(error).toBeInstanceOf(ValidationError);
	});

	it('refuses a request the server would, on the first read, without sending it', async () => {
		const api = createOpenApiClient<ClientOperations, OperationsByRoute>(
			http,
			operations,
			{ validate: { request: true } },
		);
		const count = sent.length;
		const stream = api.stream('exportItems', { json: { limit: 0 } });
		expect(sent.length).toBe(count);
		const error = await collect(stream).catch((e: unknown) => e);
		expect(error).toBeInstanceOf(ValidationError);
		expect((error as ValidationError).failure.kind).toBe('request');
		expect(sent.length).toBe(count);
		// A valid one goes through the check, then connects.
		const items = await collect(
			api.stream('exportItems', { json: { limit: 1 } }),
		);
		expect(items).toHaveLength(1);
	});

	it('takes only an operation that replies with a stream', () => {
		const api = createOpenApiClient<ClientOperations, OperationsByRoute>(
			http,
			operations,
		);
		// @ts-expect-error getItem replies whole
		expect(() => api.stream('getItem', { param: { id: 1 } })).toThrow(
			'getItem does not reply with a stream',
		);
		// @ts-expect-error the topic is required
		void api.stream('watchFeed', { query: {} });
	});
});
