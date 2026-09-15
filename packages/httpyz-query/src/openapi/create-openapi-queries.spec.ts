/** TanStack Query options for a bound client's operations, run by query-core's own `QueryClient`. */
import { describe, expect, it } from 'bun:test';
import { createHttpClient, ReplyStatusError } from '@nxgt/httpyz';
import { createOpenApiClient } from '@nxgt/openapi-httpyz';
import {
	isCancelledError,
	MutationObserver,
	QueryClient,
} from '@tanstack/query-core';
import { operations as dateOperations } from '../../test/generated/dates/operations';
import { operations } from '../../test/generated/operations';
import { createOpenApiQueries } from '../openapi';

const AT = '2024-05-01T10:00:00.000Z';

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
			if (pathname === '/health') return Response.json({ up: true });
			if (request.method === 'DELETE') {
				return new Response(null, { status: 204 });
			}
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
				? Response.json(
						{ title: 'missing' },
						{
							status: 404,
							headers: { 'content-type': 'application/problem+json' },
						},
					)
				: Response.json({ id, name: 'item', createdAt: AT });
		},
	});
	const bound = createOpenApiClient(http, operations);
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	return {
		http,
		sent,
		reached,
		client,
		queries: createOpenApiQueries(bound),
	};
}

describe('createOpenApiQueries', () => {
	it("resolves a query to its 2xx reply's data, keyed by its input alone", async () => {
		const { queries, client } = api();
		const options = queries.queryOptions(
			'get',
			'/items/{id}',
			{ param: { id: 1 } },
			{ timeout: 1_000 },
		);
		expect([...options.queryKey]).toEqual([
			'get',
			'/items/{id}',
			{ param: { id: 1 } },
		]);
		const item = await client.fetchQuery(options);
		const name: string = item.name;
		expect(name).toBe('item');
		const cached: { id: number } | undefined = client.getQueryData(
			options.queryKey,
		);
		expect(cached).toEqual(item);

		const caught = await client
			.fetchQuery(
				queries.queryOptions('get', '/items/{id}', { param: { id: 404 } }),
			)
			.catch((error: unknown) => error);
		expect(caught).toBeInstanceOf(ReplyStatusError);
	});

	it('calls an operation that takes nothing with its init alone, and aborts it when cancelled', async () => {
		const { queries, client, sent, reached } = api();
		const health = queries.queryOptions('get', '/health', { timeout: 1_000 });
		expect([...health.queryKey]).toEqual(['get', '/health']);
		const status = await client.fetchQuery(health);
		const up: boolean = status.up;
		expect(up).toBe(true);

		const hang = queries.queryOptions('get', '/hang');
		const fetching = client.fetchQuery(hang).catch((error: unknown) => error);
		await reached;
		await client.cancelQueries({ queryKey: hang.queryKey });
		expect(sent.at(-1)?.signal.aborted).toBe(true);
		expect(isCancelledError(await fetching)).toBe(true);
	});

	it('keys header parameters too, apart from the init', () => {
		const { queries } = api();
		expect([
			...queries.queryOptions(
				'get',
				'/items',
				{ query: { first: 2 }, header: { 'x-locale': 'fr' } },
				{ headers: { 'x-other': '1' } },
			).queryKey,
		]).toEqual([
			'get',
			'/items',
			{ query: { first: 2 }, header: { 'x-locale': 'fr' } },
		]);
	});

	it('pages an infinite query through one of its query parameters', async () => {
		const { queries, client, sent } = api();
		const options = queries.infiniteQueryOptions(
			'get',
			'/items',
			{ query: { first: 1 } },
			{
				pageParamName: 'after',
				initialPageParam: null as string | null,
				getNextPageParam: (last) => last.next,
			},
		);
		const data = await client.fetchInfiniteQuery({ ...options, pages: 2 });
		expect(data.pages.map((page) => page.items[0]?.name)).toEqual(['a', 'b']);
		expect(sent.map((request) => new URL(request.url).search)).toEqual([
			'?first=1',
			'?first=1&after=c1',
		]);
	});

	it('runs a mutation with the input mutate() is given', async () => {
		const { queries, client, sent } = api();
		const remove = new MutationObserver(
			client,
			queries.mutationOptions('delete', '/items/{id}'),
		);
		expect(await remove.mutate({ param: { id: 3 } })).toBeUndefined();
		expect(sent[0]?.url).toBe('http://api.test/items/3');

		const create = new MutationObserver(
			client,
			queries.mutationOptions('post', '/items'),
		);
		const created = await create.mutate({ json: { name: 'new' } });
		expect(created.name).toBe('new');
	});

	it('reads a function init at each mutate(), from its input', async () => {
		const { queries, client, sent } = api();
		const remove = new MutationObserver(
			client,
			queries.mutationOptions('delete', '/items/{id}', (input) => ({
				headers: { 'x-item': String(input.param.id) },
			})),
		);
		await remove.mutate({ param: { id: 3 } });
		await remove.mutate({ param: { id: 4 } });
		expect(sent.map((request) => request.headers.get('x-item'))).toEqual([
			'3',
			'4',
		]);
	});

	it('throws at once for an operation the spec does not have, an infinite query too', () => {
		const { queries } = api();
		const untyped = queries as unknown as {
			infiniteQueryOptions(...args: unknown[]): unknown;
		};
		expect(() =>
			untyped.infiniteQueryOptions(
				'get',
				'/nowhere',
				{},
				{
					pageParamName: 'after',
					initialPageParam: null,
					getNextPageParam: () => null,
				},
			),
		).toThrow('The spec has no GET /nowhere operation');
	});

	it("returns a decoding client's data as its schemas output it", async () => {
		const { http, client } = api();
		const decoding = createOpenApiClient(http, dateOperations, {
			decode: true,
		});
		const queries = createOpenApiQueries(decoding);
		const item = await client.fetchQuery(
			queries.queryOptions('get', '/items/{id}', { param: { id: 1 } }),
		);
		const at: Date | undefined = item.createdAt;
		expect(at).toEqual(new Date(AT));
	});
});

/** Types only: never run. */
function types() {
	const { queries } = api();
	// @ts-expect-error: no operation at GET /nowhere
	queries.queryOptions('get', '/nowhere');
	// @ts-expect-error: the spec has no TRACE operation, so no such method
	queries.queryOptions('trace', '/items');
	// @ts-expect-error: the operation's {id} is required
	queries.queryOptions('get', '/items/{id}');
	queries.infiniteQueryOptions(
		'get',
		'/items',
		{},
		{
			// @ts-expect-error: not a query parameter of listItems
			pageParamName: 'page',
			initialPageParam: null,
			getNextPageParam: () => null,
		},
	);
	// @ts-expect-error: mutate() must fill the path's {id}
	queries.mutationOptions('delete', '/items/{id}').mutationFn();
	queries.mutationOptions('get', '/health').mutationFn();
	// A filter may hold what a key holds: header parameters, `decode: false`.
	queries.queryKey('get', '/items', {
		header: { 'x-locale': 'fr' },
		decode: false,
	});
}
void types;
