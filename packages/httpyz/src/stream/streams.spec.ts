/**
 * `http.events()` and `http.lines()`, against a Hono app that streams, and
 * against replies made by hand, where a test needs to say when a stream
 * drops, stalls or ends.
 */
import { describe, expect, it } from 'bun:test';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import {
	createHttpClient,
	type HttpClientOptions,
	NetworkError,
	type ServerEvent,
	TimeoutError,
	UndeclaredStatusError,
	ValidationError,
} from '../index';

const BASE = 'http://api.test';
const AT = '2024-05-01T10:00:00Z';
const Item = z.object({
	id: z.int(),
	at: z.iso.datetime().transform((value) => new Date(value)),
});
const encoder = new TextEncoder();

/** A reply streaming `chunks`, then ending, failing, or stalling for good. */
const reply = (
	chunks: string[],
	{
		type = 'text/event-stream',
		end,
		every = 0,
		cancelled,
	}: {
		type?: string;
		end?: Error | 'stall';
		every?: number;
		cancelled?: () => void;
	} = {},
) => {
	let next = 0;
	const body = new ReadableStream<Uint8Array>({
		async pull(controller) {
			if (every > 0) await Bun.sleep(every);
			const chunk = chunks[next++];
			if (chunk !== undefined) return controller.enqueue(encoder.encode(chunk));
			if (end === 'stall') return new Promise(() => {});
			if (end) return controller.error(end);
			controller.close();
		},
		cancel: () => cancelled?.(),
	});
	return new Response(body, { headers: { 'content-type': type } });
};
const noContent = () => new Response(null, { status: 204 });

/** A client answering its nth request with the nth reply, and every request it sent. */
const scripted = (
	replies: ((request: Request) => Response | Promise<Response>)[],
	options: HttpClientOptions = {},
) => {
	const sent: Request[] = [];
	const http = createHttpClient({
		baseUrl: BASE,
		fetch: async (request) => {
			sent.push(request);
			const answer = replies[sent.length - 1];
			if (!answer) throw new Error(`no reply ${sent.length} is scripted`);
			return answer(request);
		},
		...options,
	});
	return { http, sent };
};

/** What a stream yields, then how it ended: `undefined`, or what it threw. */
async function drain<T>(stream: AsyncIterable<T>) {
	const items: T[] = [];
	try {
		for await (const item of stream) items.push(item);
		return { items, error: undefined as unknown };
	} catch (error) {
		return { items, error };
	}
}

describe('http.events()', () => {
	it('types each event it declares, narrowed on its name, and decodes its data', async () => {
		const app = new Hono().get('/feed', (c) =>
			streamSSE(c, async (stream) => {
				await stream.writeSSE({
					event: 'created',
					data: JSON.stringify({ id: 1, at: AT }),
					id: '1',
				});
				await stream.writeSSE({ event: 'removed', data: '7', id: '2' });
				await stream.writeSSE({ event: 'mystery', data: '?' });
				await stream.writeSSE({ event: 'ping', data: 'tick' });
			}),
		);
		const unknown: ServerEvent[] = [];
		const http = createHttpClient({
			baseUrl: BASE,
			fetch: async (request) => app.fetch(request),
		});
		const stream = http.events('/feed', {
			events: { created: Item, removed: z.int(), ping: null },
			onUnknownEvent: (event) => unknown.push(event),
			reconnect: false,
		});
		const seen: unknown[] = [];
		for await (const event of stream) {
			// @ts-expect-error not an event it declares
			expect(event.event === 'mystery').toBe(false);
			if (event.event === 'created') {
				const at: Date = event.data.at;
				seen.push([event.event, event.data.id, at, event.id]);
			} else if (event.event === 'removed') {
				const id: number = event.data;
				seen.push([event.event, id]);
			} else {
				const text: string = event.data;
				seen.push([event.event, text]);
			}
		}
		expect(seen).toEqual([
			['created', 1, new Date(AT), '1'],
			['removed', 7],
			['ping', 'tick'],
		]);
		expect(unknown).toEqual([{ event: 'mystery', data: '?', id: '2' }]);
		expect(stream.lastEventId).toBe('2');
	});

	it('yields every event as text when it declares none', async () => {
		const { http, sent } = scripted([
			() => reply(['event: a\ndata: {"x":1}\n\n', 'data: plain\n\n']),
		]);
		const { items } = await drain(http.events('/raw', { reconnect: false }));
		const first: ServerEvent | undefined = items[0];
		expect(first).toEqual({ event: 'a', data: '{"x":1}', id: undefined });
		expect(items[1]?.data).toBe('plain');
		expect(sent[0]?.headers.get('accept')).toBe('text/event-stream');
	});

	it('returns what each schema was given, with decode: false', async () => {
		const { http } = scripted([
			() => reply([`event: created\ndata: {"id":1,"at":"${AT}"}\n\n`]),
		]);
		const stream = http.events('/feed', {
			events: { created: Item },
			decode: false,
			reconnect: false,
		});
		for await (const event of stream) {
			const at: string = event.data.at;
			expect(at).toBe(AT);
		}
	});

	it('refuses data its schema refuses, and data that is not JSON', async () => {
		const events = { created: Item };
		const refused = await drain(
			scripted([
				() => reply(['event: created\ndata: {"id":"x"}\n\n']),
			]).http.events('/feed', { events, reconnect: false }),
		);
		expect(refused.error).toBeInstanceOf(ValidationError);
		expect((refused.error as ValidationError).failure).toMatchObject({
			kind: 'response',
			method: 'get',
			path: '/feed',
			status: 200,
			issues: [
				{ target: 'response', path: ['id'] },
				{ target: 'response', path: ['at'] },
			],
		});
		const garbled = await drain(
			scripted([() => reply(['event: created\ndata: {\n\n'])]).http.events(
				'/feed',
				{ events, reconnect: false },
			),
		);
		expect((garbled.error as ValidationError).failure.issues[0]).toMatchObject({
			code: 'invalid_json',
			message: "the created event's data is not valid JSON",
		});
		// Unchecked, the data is taken at its word, still parsed.
		const trusted = await drain(
			scripted([
				() => reply(['event: created\ndata: {"id":"x"}\n\n']),
			]).http.events('/feed', { events, validate: false, reconnect: false }),
		);
		expect(trusted.items[0]?.data as unknown).toEqual({ id: 'x' });
	});

	it('reconnects with Last-Event-ID after the stream ends or drops, following retry:, until a 204', async () => {
		const { http, sent } = scripted([
			() => reply(['retry: 5\nid: 1\ndata: a\n\n']),
			() => reply(['id: 2\ndata: b\n\n'], { end: new TypeError('reset') }),
			noContent,
		]);
		const stream = http.events('/feed');
		const { items, error } = await drain(stream);
		expect(error).toBeUndefined();
		expect(items.map((event) => event.data)).toEqual(['a', 'b']);
		expect(sent.map((request) => request.headers.get('last-event-id'))).toEqual(
			[null, '1', '2'],
		);
		expect(stream.lastEventId).toBe('2');
	});

	it('resumes from lastEventId, and runs auth and middleware on each connection', async () => {
		const ran: string[] = [];
		let token = 0;
		const { http, sent } = scripted([() => reply(['data: a\n\n']), noContent], {
			auth: { token: () => `t${++token}` },
			use: [
				async (request, next, call) => {
					ran.push(`${call.method} ${call.path}`);
					return next(request);
				},
			],
		});
		await drain(
			http.events('/feed', {
				lastEventId: '41',
				reconnect: { delay: 1 },
			}),
		);
		expect(ran).toEqual(['get /feed', 'get /feed']);
		expect(sent.map((request) => request.headers.get('authorization'))).toEqual(
			['Bearer t1', 'Bearer t2'],
		);
		expect(sent[0]?.headers.get('last-event-id')).toBe('41');
	});

	it('does not reconnect after an error status, which it throws unread', async () => {
		const { http, sent } = scripted([
			() => Response.json({ title: 'down' }, { status: 503 }),
		]);
		const { error } = await drain(http.events('/feed'));
		expect(error).toBeInstanceOf(UndeclaredStatusError);
		expect(await (error as UndeclaredStatusError).response.json()).toEqual({
			title: 'down',
		});
		expect(sent).toHaveLength(1);
	});

	it('refuses a reply that is not an event stream', async () => {
		const { http } = scripted([() => Response.json([])]);
		const { error } = await drain(http.events('/feed'));
		expect((error as ValidationError).failure.issues[0]?.code).toBe(
			'invalid_content_type',
		);
	});

	it('gives up after its attempts in a row, with the last failure', async () => {
		const down = () => {
			throw new TypeError('fetch failed');
		};
		const { http, sent } = scripted([down, down, down]);
		const { error } = await drain(
			http.events('/feed', { reconnect: { attempts: 2, delay: 1 } }),
		);
		expect(error).toBeInstanceOf(NetworkError);
		expect(sent).toHaveLength(3);
	});

	it('ends with the stream when it does not reconnect: without reconnect, or for a POST', async () => {
		const dropped = await drain(
			scripted([
				() => reply(['data: a\n\n'], { end: new TypeError('reset') }),
			]).http.events('/feed', { reconnect: false }),
		);
		expect(dropped.items).toHaveLength(1);
		expect(dropped.error).toBeInstanceOf(NetworkError);

		const { http, sent } = scripted([() => reply(['data: done\n\n'])]);
		const posted = await drain(
			http.events('/chat', { method: 'post', json: { prompt: 'hi' } }),
		);
		expect(posted).toMatchObject({
			items: [{ data: 'done' }],
			error: undefined,
		});
		expect(sent).toHaveLength(1);
		expect(await sent[0]?.json()).toEqual({ prompt: 'hi' });
	});

	it('ends on close() or break, and cancels the reply', async () => {
		let cancelled = 0;
		const stalling = () =>
			reply(['data: a\n\n'], {
				end: 'stall',
				cancelled: () => cancelled++,
			});
		const closing = scripted([stalling]).http.events('/feed');
		const closed = [];
		for await (const event of closing) {
			closed.push(event);
			closing.close();
		}
		expect(closed).toHaveLength(1);

		for await (const _ of scripted([stalling]).http.events('/feed')) break;
		// A cancel crosses the decoder's pipe on a later turn.
		for (let turn = 0; turn < 50 && cancelled < 2; turn++) await Bun.sleep(1);
		expect(cancelled).toBe(2);
	});

	it('lets an abort the caller asked for through as it is', async () => {
		const controller = new AbortController();
		const stream = scripted([
			() => reply(['data: a\n\n'], { end: 'stall' }),
		]).http.events('/feed', { signal: controller.signal });
		const { items, error } = await drain(
			(async function* () {
				for await (const event of stream) {
					yield event;
					controller.abort();
				}
			})(),
		);
		expect(items).toHaveLength(1);
		expect((error as Error).name).toBe('AbortError');
	});

	it('bounds the opening with timeout, and not the stream', async () => {
		const never = (request: Request) =>
			new Promise<Response>((_, reject) => {
				request.signal.addEventListener('abort', () =>
					reject(request.signal.reason),
				);
			});
		const late = await drain(
			scripted([never]).http.events('/feed', { timeout: 10 }),
		);
		expect(late.error).toBeInstanceOf(TimeoutError);

		const slow = await drain(
			scripted([
				() => reply(['data: a\n\n', 'data: b\n\n'], { every: 30 }),
			]).http.events('/feed', { timeout: 10, reconnect: false }),
		);
		expect(slow).toMatchObject({ items: [{ data: 'a' }, { data: 'b' }] });
		expect(slow.error).toBeUndefined();
	});
});

describe('http.lines()', () => {
	const ndjson = (chunks: string[], end?: Error) =>
		reply(chunks, { type: 'application/x-ndjson', end });

	it('reads each line, checked by item, the last one without its line end', async () => {
		const { http, sent } = scripted([
			() =>
				ndjson([
					`{"id":1,"at":"${AT}"}\n{"id":2,`,
					`"at":"${AT}"}\r\n\n`,
					'{"id":3,',
					`"at":"${AT}"}`,
				]),
		]);
		const items: Date[] = [];
		for await (const item of http.lines('/export', { item: Item })) {
			items.push(item.at);
		}
		expect(items).toEqual([new Date(AT), new Date(AT), new Date(AT)]);
		expect(sent[0]?.headers.get('accept')).toBe(
			'application/jsonl, application/x-ndjson',
		);
	});

	it('yields each line parsed without item, and ends on a 204', async () => {
		const { http } = scripted([
			() => reply(['1\n"two"\n'], { type: 'application/jsonl' }),
		]);
		const { items } = await drain(http.lines('/export'));
		const first: unknown = items[0];
		expect([first, items[1]]).toEqual([1, 'two']);
		const empty = await drain(scripted([noContent]).http.lines('/export'));
		expect(empty).toEqual({ items: [], error: undefined });
	});

	it('refuses a line that is not JSON or that item refuses, and throws a drop', async () => {
		const garbled = await drain(
			scripted([() => ndjson(['{"id":1}\n{\n'])]).http.lines('/export', {
				item: z.object({ id: z.int() }),
			}),
		);
		expect(garbled.items).toEqual([{ id: 1 }]);
		expect((garbled.error as ValidationError).failure.issues[0]?.code).toBe(
			'invalid_json',
		);
		const refused = await drain(
			scripted([() => ndjson(['{"id":"x"}\n'])]).http.lines('/export', {
				item: z.object({ id: z.int() }),
			}),
		);
		expect((refused.error as ValidationError).failure.issues[0]?.path).toEqual([
			'id',
		]);
		const dropped = await drain(
			scripted([() => ndjson(['1\n'], new TypeError('reset'))]).http.lines(
				'/export',
			),
		);
		expect(dropped.items).toEqual([1]);
		expect(dropped.error).toBeInstanceOf(NetworkError);
	});
});
