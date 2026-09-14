/** Cancelling a bound client's calls: `latest` and `signal` through the init, and `api.group()`. */
import { describe, expect, it } from 'bun:test';
import { createHttpClient, isAbortError, TimeoutError } from '@nxgt/httpyz';
import { operations } from '../../test/generated/operations';
import type {
	ClientOperations,
	OperationsByRoute,
} from '../../test/generated/types';
import { createOpenApiClient } from '../index';

/** Never replies: fails only when the request's signal aborts. */
const hang = (request: Request) =>
	new Promise<Response>((_, reject) => {
		request.signal.addEventListener(
			'abort',
			() => reject(request.signal.reason),
			{ once: true },
		);
	});
const failure = (call: Promise<unknown>) =>
	call.then(
		() => undefined,
		(caught: unknown) => caught,
	);
const bound = (fetch: (request: Request) => Promise<Response>) =>
	createOpenApiClient<ClientOperations, OperationsByRoute>(
		createHttpClient({ baseUrl: 'http://api.test', fetch }),
		operations,
	);
/** `/health` answers 204; every other request hangs. */
const healthOnly = async (request: Request) =>
	request.url.endsWith('/health')
		? new Response(null, { status: 204 })
		: hang(request);

describe('cancelling a bound client', () => {
	it('passes latest and signal on through the init', async () => {
		let arrive = () => {};
		const reached = new Promise<void>((resolve) => {
			arrive = resolve;
		});
		const api = bound(async (request) => {
			const page = new URL(request.url).searchParams.get('page');
			if (page !== '1') return Response.json({ page });
			arrive();
			return hang(request);
		});
		const first = failure(
			api.get('/items', { query: { page: 1 } }, { latest: 'items' }),
		);
		await reached;
		const second = api.get(
			'/items',
			{ query: { page: 2 } },
			{ latest: 'items' },
		);
		expect(isAbortError(await first)).toBe(true);
		expect((await second).data).toEqual({ page: '2' });

		const controller = new AbortController();
		const aborted = failure(
			bound(hang).op(
				'getItem',
				{ param: { id: 1 } },
				{
					signal: controller.signal,
				},
			),
		);
		controller.abort();
		expect(isAbortError(await aborted)).toBe(true);
	});

	it("cancels a group's calls and streams, and only those; the group goes on", async () => {
		const api = bound(healthOnly);
		const page = api.group();
		const signal = page.signal;
		const call = failure(page.op('getItem', { param: { id: 1 } }));
		const read = failure(
			(async () => {
				for await (const _ of page.stream('watchFeed', {
					query: { topic: 'x' },
				}));
			})(),
		);
		const outside = failure(
			api.op('getItem', { param: { id: 2 } }, { timeout: 30 }),
		);
		page.cancel();
		expect(signal.aborted).toBe(true);
		expect(isAbortError(await call)).toBe(true);
		expect(isAbortError(await read)).toBe(true);
		// The client's own call was not in the group: it ran to its timeout.
		expect(await outside).toBeInstanceOf(TimeoutError);
		expect((await page.op('health')).status).toBe(204);
	});

	it('aborts with the reason cancel() is given', async () => {
		const page = bound(hang).group();
		const call = failure(page.get('/items/{id}', { param: { id: 1 } }));
		const reason = new Error('left the page');
		page.cancel(reason);
		expect(await call).toBe(reason);
	});
});
