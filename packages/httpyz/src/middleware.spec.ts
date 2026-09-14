/** `use`, `auth` and `retry`, against a scripted `fetch`. */
import { describe, expect, it } from 'bun:test';
import { operations } from '../test/generated/operations';
import type {
	ClientOperations,
	OperationsByRoute,
} from '../test/generated/types';
import {
	type ClientOptions,
	createClient,
	type Middleware,
	NetworkError,
	TimeoutError,
	UndeclaredStatusError,
} from './index';
import { retryDelay, retrySettings } from './retry';

type Answer = Response | Error | ((request: Request) => Promise<Response>);

/** A fetch that gives its answers in order, and keeps each request. */
const script = (...answers: Answer[]) => {
	const seen: Request[] = [];
	const fetch = async (request: Request): Promise<Response> => {
		seen.push(request);
		const answer = answers.shift();
		if (answer === undefined) throw new Error('no answer left');
		if (answer instanceof Error) throw answer;
		return typeof answer === 'function' ? answer(request) : answer;
	};
	return { fetch, seen };
};
const api = (
	fetch: (request: Request) => Promise<Response>,
	options: ClientOptions = {},
) =>
	createClient<ClientOperations, OperationsByRoute>(operations, {
		baseUrl: 'http://api.test',
		fetch,
		...options,
	});
const item = () => Response.json({ id: 1, name: 'a' });
const status = (code: number, headers?: HeadersInit) =>
	new Response(null, { status: code, headers });
const getItem = { param: { id: 1 } };
const failure = (call: Promise<unknown>) =>
	call.then(
		() => undefined,
		(caught: unknown) => caught,
	);

describe('use', () => {
	it('runs around each request, the first outermost', async () => {
		const order: string[] = [];
		const tag =
			(name: string): Middleware =>
			async (request, next, call) => {
				order.push(`${name} ${call.operationId}`);
				request.headers.set(`x-${name}`, '1');
				const response = await next(request);
				order.push(`${name} done`);
				return response;
			};
		const { fetch, seen } = script(item());
		const reply = await api(fetch, { use: [tag('a'), tag('b')] }).get(
			'/items/{id}',
			getItem,
		);
		expect(reply.status).toBe(200);
		expect(order).toEqual(['a getItem', 'b getItem', 'b done', 'a done']);
		expect(seen[0]?.headers.get('x-b')).toBe('1');
	});

	it('may answer itself, and fetch is never called', async () => {
		const { fetch, seen } = script();
		const cached: Middleware = async () =>
			Response.json({ id: 2, name: 'cached' });
		const reply = await api(fetch, { use: [cached] }).get(
			'/items/{id}',
			getItem,
		);
		expect(reply.data).toEqual({ id: 2, name: 'cached' });
		expect(seen).toHaveLength(0);
	});

	it('lets its own error through as it is, unretried', async () => {
		const { fetch, seen } = script();
		const refuse: Middleware = async () => {
			throw new RangeError('refused');
		};
		const error = await failure(
			api(fetch, { use: [refuse], retry: 2 }).get('/items/{id}', getItem),
		);
		expect(error).toBeInstanceOf(RangeError);
		expect(seen).toHaveLength(0);
	});
});

describe('auth', () => {
	it('sends the token it awaits', async () => {
		const { fetch, seen } = script(item(), item());
		let token: string | undefined = 't1';
		const client = api(fetch, { auth: { token: async () => token } });
		await client.get('/items/{id}', getItem);
		token = undefined;
		await client.get('/items/{id}', getItem);
		expect(seen.map((request) => request.headers.get('authorization'))).toEqual(
			['Bearer t1', null],
		);
	});

	it('refreshes once for the calls refused together, and sends them again', async () => {
		let current = 'old';
		let refreshes = 0;
		const fetch = async (request: Request) =>
			request.headers.get('authorization') === 'Bearer new'
				? item()
				: status(401);
		const client = api(fetch, {
			auth: {
				token: () => current,
				refresh: async () => {
					refreshes += 1;
					await Bun.sleep(5);
					current = 'new';
				},
			},
		});
		const replies = await Promise.all(
			[1, 2, 3].map((id) => client.get('/items/{id}', { param: { id } })),
		);
		expect(replies.map((reply) => reply.status)).toEqual([200, 200, 200]);
		expect(refreshes).toBe(1);
	});

	it('sends the body again with the new token', async () => {
		const bodies: string[] = [];
		let current = 'old';
		const fetch = async (request: Request) => {
			bodies.push(await request.text());
			return request.headers.get('authorization') === 'Bearer new'
				? status(204)
				: status(401);
		};
		const client = api(fetch, {
			auth: {
				token: () => current,
				refresh: () => {
					current = 'new';
				},
			},
		});
		const reply = await client.put('/items/{id}', {
			param: { id: 1 },
			body: new TextEncoder().encode('hi'),
		});
		expect(reply.status).toBe(204);
		expect(bodies).toEqual(['hi', 'hi']);
	});

	it('leaves the 401 as the reply when the refresh fails', async () => {
		const { fetch, seen } = script(status(401));
		const client = api(fetch, {
			auth: {
				token: () => 'old',
				refresh: async () => {
					throw new Error('signed out');
				},
			},
		});
		const error = await failure(client.get('/items/{id}', getItem));
		expect(error).toBeInstanceOf(UndeclaredStatusError);
		expect((error as UndeclaredStatusError).status).toBe(401);
		expect(seen).toHaveLength(1);
	});
});

describe('retry', () => {
	const now = { delay: () => 0 };

	it('retries a failure that may pass, then gives the reply', async () => {
		const { fetch, seen } = script(
			status(503),
			new TypeError('fetch failed'),
			item(),
		);
		const reply = await api(fetch, { retry: { attempts: 2, ...now } }).get(
			'/items/{id}',
			getItem,
		);
		expect(reply.status).toBe(200);
		expect(seen).toHaveLength(3);
	});

	it('stops after its attempts, with the last reply or failure', async () => {
		const replied = script(status(503), status(503));
		const error = await failure(
			api(replied.fetch, { retry: { attempts: 1, ...now } }).get(
				'/items/{id}',
				getItem,
			),
		);
		expect((error as UndeclaredStatusError).status).toBe(503);
		expect(replied.seen).toHaveLength(2);

		const down = script(new TypeError('a'), new TypeError('b'));
		const failed = await failure(
			api(down.fetch, { retry: { attempts: 1, ...now } }).get(
				'/items/{id}',
				getItem,
			),
		);
		expect(failed).toBeInstanceOf(NetworkError);
		expect(((failed as Error).cause as Error).message).toBe('b');
	});

	it('never repeats a POST, nor a call that says retry: false', async () => {
		const post = script(status(503));
		await failure(
			api(post.fetch, { retry: { attempts: 2, ...now } }).post('/items', {
				json: { name: 'a' },
			}),
		);
		expect(post.seen).toHaveLength(1);

		const get = script(status(503));
		await failure(
			api(get.fetch, { retry: { attempts: 2, ...now } }).get(
				'/items/{id}',
				getItem,
				{ retry: false },
			),
		);
		expect(get.seen).toHaveLength(1);
	});

	it('sends the body again on each try', async () => {
		const bodies: string[] = [];
		const answer = (code: number) => async (request: Request) => {
			bodies.push(await request.text());
			return status(code);
		};
		const { fetch } = script(answer(503), answer(204));
		await api(fetch, { retry: { attempts: 1, ...now } }).put('/items/{id}', {
			param: { id: 1 },
			body: new TextEncoder().encode('hi'),
		});
		expect(bodies).toEqual(['hi', 'hi']);
	});

	it('waits as Retry-After says, within maxDelay', () => {
		const settings = retrySettings({ delay: () => 50, maxDelay: 1_000 });
		if (!settings) throw new Error('unreachable');
		const after = (value: string) =>
			retryDelay(status(503, { 'retry-after': value }), 1, settings);
		expect(after('0.5')).toBe(500);
		expect(after(new Date(Date.now() - 5_000).toUTCString())).toBe(0);
		// Longer than maxDelay: the reply stands.
		expect(after('60')).toBeUndefined();
		expect(after('soon')).toBe(50);
		expect(retryDelay(undefined, 3, settings)).toBe(50);

		const backoff = retrySettings(2);
		for (const attempt of [1, 2, 3, 4]) {
			const wait = backoff?.delay(attempt) ?? -1;
			expect(wait).toBeGreaterThanOrEqual(0);
			expect(wait).toBeLessThanOrEqual(300 * 2 ** (attempt - 1));
		}
	});

	it('stops waiting when the call times out or is aborted', async () => {
		const long = { attempts: 1, delay: () => 10_000, maxDelay: 20_000 };
		const timed = script(status(503), item());
		const late = await failure(
			api(timed.fetch, { retry: long, timeout: 20 }).get(
				'/items/{id}',
				getItem,
			),
		);
		expect(late).toBeInstanceOf(TimeoutError);

		const aborted = script(status(503), item());
		const controller = new AbortController();
		const pending = failure(
			api(aborted.fetch, { retry: long }).get('/items/{id}', getItem, {
				signal: controller.signal,
			}),
		);
		await Bun.sleep(5);
		controller.abort();
		expect(((await pending) as Error).name).toBe('AbortError');
	});
});
