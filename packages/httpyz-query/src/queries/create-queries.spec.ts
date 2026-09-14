/** TanStack Query options for a client's calls, run by query-core's own `QueryClient`. */
import { describe, expect, it } from 'bun:test';
import { createHttpClient, isAbortError, ReplyStatusError } from '@nxgt/httpyz';
import {
	isCancelledError,
	MutationObserver,
	QueryClient,
} from '@tanstack/query-core';
import { z } from 'zod';
import { createQueries } from '../index';

const Item = z.object({ id: z.int(), name: z.string() });
const Page = z.object({ items: z.array(Item), next: z.string().nullable() });
const Problem = z.object({ title: z.string() });

/** A stub API, every request it was sent, and a query client that never retries. */
function api() {
	const sent: Request[] = [];
	let arrive = () => {};
	const reached = new Promise<void>((resolve) => {
		arrive = resolve;
	});
	const http = createHttpClient({
		baseUrl: 'http://api.test',
		fetch: async (request) => {
			sent.push(request);
			const { pathname, searchParams } = new URL(request.url);
			if (pathname === '/hang') {
				arrive();
				return new Promise<Response>((_, reject) => {
					request.signal.addEventListener(
						'abort',
						() => reject(request.signal.reason),
						{ once: true },
					);
				});
			}
			if (request.method === 'DELETE')
				return new Response(null, { status: 204 });
			if (request.method === 'POST') {
				const { name } = (await request.json()) as { name: string };
				return Response.json({ id: 9, name }, { status: 201 });
			}
			if (pathname === '/items') {
				return Response.json(
					searchParams.get('after') === null
						? { items: [{ id: 1, name: 'a' }], next: 'c1' }
						: { items: [{ id: 2, name: 'b' }], next: null },
				);
			}
			const id = Number(pathname.split('/')[2]);
			return id === 404
				? Response.json({ title: 'missing' }, { status: 404 })
				: Response.json({ id, name: 'item' });
		},
	});
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	return { http, sent, reached, client, queries: createQueries(http) };
}

describe('createQueries', () => {
	it('resolves a query to the data of a 2xx reply, under a key tagged with it', async () => {
		const { queries, client } = api();
		const options = queries.queryOptions('get', '/items/{id}', {
			param: { id: 1 },
			responses: { 200: Item, 404: Problem },
		});
		expect([...options.queryKey]).toEqual([
			'get',
			'/items/{id}',
			{ param: { id: 1 } },
		]);
		const item: { id: number; name: string } = await client.fetchQuery(options);
		expect(item).toEqual({ id: 1, name: 'item' });
		const cached: { id: number; name: string } | undefined =
			client.getQueryData(options.queryKey);
		expect(cached).toEqual(item);
	});

	it('fails a query with a ReplyStatusError on a declared error reply', async () => {
		const { queries, client } = api();
		const caught = await client
			.fetchQuery(
				queries.queryOptions('get', '/items/{id}', {
					param: { id: 404 },
					responses: { 200: Item, 404: Problem },
				}),
			)
			.catch((error: unknown) => error);
		expect(caught).toBeInstanceOf(ReplyStatusError);
		expect((caught as ReplyStatusError).data).toEqual({ title: 'missing' });
	});

	it("aborts the call when the query is cancelled, or on the call's own signal", async () => {
		const first = api();
		const options = first.queries.queryOptions('get', '/hang');
		const fetching = first.client
			.fetchQuery(options)
			.catch((error: unknown) => error);
		await first.reached;
		await first.client.cancelQueries({ queryKey: options.queryKey });
		expect(first.sent[0]?.signal.aborted).toBe(true);
		expect(isCancelledError(await fetching)).toBe(true);

		const second = api();
		const controller = new AbortController();
		const own = second.client
			.fetchQuery(
				second.queries.queryOptions('get', '/hang', {
					signal: controller.signal,
				}),
			)
			.catch((error: unknown) => error);
		await second.reached;
		controller.abort();
		expect(isAbortError(await own)).toBe(true);
	});

	it('keys calls by what they send, and the start of a key matches them all', async () => {
		const { http, queries, client } = api();
		expect([...queries.queryOptions('get', '/items').queryKey]).toEqual([
			'get',
			'/items',
		]);
		expect([
			...queries.queryOptions('get', '/items', {
				query: new URLSearchParams('tag=a&tag=b'),
				decode: false,
			}).queryKey,
		]).toEqual([
			'get',
			'/items',
			{
				query: [
					['tag', 'a'],
					['tag', 'b'],
				],
				decode: false,
			},
		]);
		expect(
			createQueries(http, { scope: 'shop' }).queryKey('get', '/items'),
		).toEqual(['shop', 'get', '/items']);

		for (const id of [1, 2]) {
			await client.fetchQuery(
				queries.queryOptions('get', '/items/{id}', { param: { id } }),
			);
		}
		await client.invalidateQueries({
			queryKey: queries.queryKey('get', '/items/{id}'),
		});
		const invalidated = client
			.getQueryCache()
			.findAll({ predicate: (query) => query.state.isInvalidated });
		expect(invalidated.length).toBe(2);
	});

	it('pages an infinite query through its query parameter', async () => {
		const { queries, client, sent } = api();
		const options = queries.infiniteQueryOptions(
			'get',
			'/items',
			{ query: { first: 1 }, responses: { 200: Page } },
			{
				pageParamName: 'after',
				initialPageParam: null as string | null,
				getNextPageParam: (last) => last.next,
			},
		);
		expect([...options.queryKey]).toEqual([
			'get',
			'/items',
			{ query: { first: 1 } },
			'infinite',
		]);
		const data = await client.fetchInfiniteQuery({ ...options, pages: 2 });
		expect(data.pages.map((page) => page.items[0]?.id)).toEqual([1, 2]);
		expect(sent.map((request) => new URL(request.url).search)).toEqual([
			'?first=1',
			'?first=1&after=c1',
		]);
	});

	it('runs a mutation with what mutate() is given', async () => {
		const { queries, client, sent } = api();
		const remove = new MutationObserver(
			client,
			queries.mutationOptions('delete', '/items/{id}', {
				responses: { 204: null },
			}),
		);
		expect(await remove.mutate({ param: { id: 3 } })).toBeUndefined();
		expect(sent[0]?.url).toBe('http://api.test/items/3');

		const create = new MutationObserver(
			client,
			queries.mutationOptions('post', '/items', { responses: { 201: Item } }),
		);
		const created: { id: number; name: string } = await create.mutate({
			json: { name: 'new' },
		});
		expect(created).toEqual({ id: 9, name: 'new' });
	});
});

/** Types only: never run. */
function types() {
	const { queries } = api();
	// @ts-expect-error: the path has an {id} to fill
	queries.queryOptions('get', '/items/{id}');
	// @ts-expect-error: mutate() must fill the path's {id}
	queries.mutationOptions('delete', '/items/{id}').mutationFn();
	queries.mutationOptions('post', '/items').mutationFn();
}
void types;
