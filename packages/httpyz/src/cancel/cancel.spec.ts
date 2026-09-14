/** Cancelling calls: `isAbortError`, `latest`, groups, and an abortable auth refresh. */
import { describe, expect, it } from 'bun:test';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import {
	createHttpClient,
	type HttpClientOptions,
	isAbortError,
	TimeoutError,
} from '../index';

/** Never replies: fails only when the request's signal aborts. */
const hang = (request: Request) =>
	new Promise<Response>((_, reject) => {
		request.signal.addEventListener(
			'abort',
			() => reject(request.signal.reason),
			{ once: true },
		);
	});
/** `hang`, with a promise that resolves once a request reached it: the call is in flight. */
const inFlight = () => {
	let arrive = () => {};
	const reached = new Promise<void>((resolve) => {
		arrive = resolve;
	});
	return {
		reached,
		hang: (request: Request) => {
			arrive();
			return hang(request);
		},
	};
};
const client = (
	fetch: (request: Request) => Promise<Response>,
	options: HttpClientOptions = {},
) => createHttpClient({ baseUrl: 'http://api.test', fetch, ...options });
const failure = (call: Promise<unknown>) =>
	call.then(
		() => undefined,
		(caught: unknown) => caught,
	);
/** Reads a stream to its end, for what it throws. */
const drain = (stream: AsyncIterable<unknown>) =>
	failure(
		(async () => {
			for await (const _ of stream);
		})(),
	);

describe('isAbortError', () => {
	it('tells an abort from a failure', () => {
		const controller = new AbortController();
		controller.abort();
		expect(isAbortError(controller.signal.reason)).toBe(true);
		// A signal of AbortSignal.timeout() the caller passed.
		expect(isAbortError(new DOMException('late', 'TimeoutError'))).toBe(true);
		// The client's own timeout is a failure.
		expect(
			isAbortError(new TimeoutError({ method: 'get', path: '/' }, 10)),
		).toBe(false);
		expect(isAbortError(new TypeError('fetch failed'))).toBe(false);
		expect(isAbortError('AbortError')).toBe(false);
	});
});

describe('latest', () => {
	it('aborts the call before it with the same key', async () => {
		const slow = inFlight();
		const http = client(async (request) => {
			const q = new URL(request.url).searchParams.get('q');
			return q === 'a' ? slow.hang(request) : Response.json({ q });
		});
		const first = failure(
			http.get('/search', { query: { q: 'a' }, latest: 'search' }),
		);
		await slow.reached;
		const second = http.get('/search', {
			query: { q: 'ab' },
			latest: 'search',
		});
		const error = await first;
		expect(isAbortError(error)).toBe(true);
		expect((error as Error).message).toContain("latest: 'search'");
		expect((await second).data).toEqual({ q: 'ab' });
	});

	it('leaves the calls with another key, or none, running', async () => {
		const http = client(async () => Response.json({}));
		const replies = await Promise.all([
			http.get('/a', { latest: 'a' }),
			http.get('/b', { latest: 'b' }),
			http.get('/c'),
		]);
		expect(replies.map((reply) => reply.status)).toEqual([200, 200, 200]);
	});

	it('replaces a stream, which ends with an AbortError', async () => {
		const app = new Hono().get('/feed', (c) =>
			streamSSE(c, async (stream) => {
				await stream.writeSSE({ data: 'first' });
				await stream.sleep(200);
			}),
		);
		const http = client(async (request) => app.fetch(request));
		const events = http
			.events('/feed', { latest: 'feed', reconnect: false })
			[Symbol.asyncIterator]();
		expect((await events.next()).value).toMatchObject({ data: 'first' });
		http.events('/feed', { latest: 'feed' });
		expect(isAbortError(await failure(events.next()))).toBe(true);
	});
});

describe('group', () => {
	it('cancels every call of the group still running, and only those', async () => {
		const http = client(hang);
		const page = http.group();
		const get = failure(page.get('/a'));
		const post = failure(page.post('/b', { json: {} }));
		const outside = failure(http.get('/c', { timeout: 50 }));
		page.cancel();
		expect(isAbortError(await get)).toBe(true);
		expect(isAbortError(await post)).toBe(true);
		expect(await outside).toBeInstanceOf(TimeoutError);
	});

	it('goes on after cancel(), and aborts with a reason of its own', async () => {
		const slow = inFlight();
		const http = client(async (request) =>
			request.url.endsWith('/slow')
				? slow.hang(request)
				: Response.json({ ok: true }),
		);
		const page = http.group();
		const first = failure(page.get('/slow'));
		await slow.reached;
		const reason = new Error('left the page');
		page.cancel(reason);
		expect(await first).toBe(reason);
		expect((await page.get('/a')).data).toEqual({ ok: true });
	});

	it('aborts a call cancelled before it was sent, without sending it', async () => {
		const sent: string[] = [];
		const http = client(async (request) => {
			sent.push(request.url);
			return Response.json({});
		});
		const page = http.group();
		const call = failure(page.get('/a'));
		page.cancel();
		expect(isAbortError(await call)).toBe(true);
		expect(sent).toEqual([]);
	});

	it('cancels its streams, its sends and its own groups with it', async () => {
		const http = client(hang);
		const page = http.group();
		const widget = page.group();
		const signal = page.signal;
		const pending = [
			failure(widget.get('/a')),
			failure(page.send(new Request('http://api.test/raw'))),
			drain(page.events('/feed')),
			drain(page.lines('/export')),
		];
		page.cancel();
		expect(signal.aborted).toBe(true);
		for (const error of await Promise.all(pending)) {
			expect(isAbortError(error)).toBe(true);
		}
	});

	it("leaves its parent's calls running when it is cancelled", async () => {
		let release = () => {};
		const released = new Promise<void>((resolve) => {
			release = resolve;
		});
		const http = client(async (request) =>
			request.url.endsWith('/slow')
				? released.then(() => Response.json({ slow: true }))
				: hang(request),
		);
		const page = http.group();
		const widget = page.group();
		const parent = page.get('/slow');
		const child = failure(widget.get('/a'));
		widget.cancel();
		expect(isAbortError(await child)).toBe(true);
		release();
		expect((await parent).data).toEqual({ slow: true });
	});
});

describe('auth', () => {
	it('stops waiting for a refresh when the call is aborted; the others still get it', async () => {
		let token = 'old';
		let finish = () => {};
		const refreshed = new Promise<void>((resolve) => {
			finish = () => {
				token = 'new';
				resolve();
			};
		});
		const http = client(
			async (request) =>
				request.headers.get('authorization') === 'Bearer new'
					? Response.json({ ok: true })
					: new Response(null, { status: 401 }),
			{ auth: { token: () => token, refresh: () => refreshed } },
		);
		const controller = new AbortController();
		const aborted = failure(http.get('/me', { signal: controller.signal }));
		const waiting = http.get('/me');
		await Bun.sleep(5);
		controller.abort();
		expect(isAbortError(await aborted)).toBe(true);
		finish();
		expect((await waiting).status).toBe(200);
	});
});
