/** `RESTDataSource`: typed calls, the caller's token, a shared cache, one error. */
import { beforeEach, describe, expect, it } from 'bun:test';
import { cache, isAbortError } from '@nxgt/httpyz';
import { operations } from '../../test/generated/operations';
import type { Bookmark, ClientOperations } from '../../test/generated/types';
import {
	DataSourceError,
	defaultCache,
	RESTDataSource,
	type RESTDataSourceOptions,
	relayPaginate,
} from '../index';

type Fetch = (request: Request) => Promise<Response>;

/** A bookmarks service that counts its requests, and every request it was sent. */
function service() {
	const sent: Request[] = [];
	const fetch: Fetch = async (request) => {
		sent.push(request.clone());
		const n = sent.length;
		const { pathname } = new URL(request.url);
		const id = pathname.split('/')[2] ?? '';
		if (id === 'missing') {
			return Response.json(
				{ message: 'errors.bookmark-not-found' },
				{ status: 404 },
			);
		}
		if (id === 'private') {
			return Response.json(
				{ message: 'errors.unauthenticated' },
				{ status: 401 },
			);
		}
		if (id === 'broken') return new Response('down', { status: 503 });
		if (pathname === '/bookmarks' && request.method === 'GET') {
			return Response.json({
				data: [{ id: 'b1', url: 'https://example.com' }],
				metadata: { hasNextPage: false, totalElements: 1 },
			});
		}
		if (request.method === 'QUERY') {
			const { q } = (await request.json()) as { q: string };
			return Response.json({ data: [{ id: `${q}${n}`, url: '' }] });
		}
		const status = request.method === 'POST' ? 201 : 200;
		return Response.json(
			{ id: id || 'new', url: `https://example.com/${n}` },
			{ status },
		);
	};
	return { fetch, sent };
}
const route = (request: Request) =>
	`${request.method} ${new URL(request.url).pathname}`;

class Bookmarks extends RESTDataSource<ClientOperations> {
	bookmark(id: string) {
		return this.data(this.get('/bookmarks/{id}', { param: { id } }));
	}
	update(id: string, url: string) {
		return this.data(
			this.put('/bookmarks/{id}', { param: { id }, json: { url } }),
		);
	}
	create(url: string) {
		return this.data(this.post('/bookmarks', { json: { url } }));
	}
	search(q: string) {
		return this.data(this.query('/bookmarks', { json: { q } }));
	}
	async page() {
		// The same call, through the client itself.
		const page = await this.data(
			this.api.get('/bookmarks', { query: { first: 10 } }),
		);
		return relayPaginate(page);
	}
}
const source = (
	fetch: Fetch,
	options: Partial<RESTDataSourceOptions<ClientOperations>> = {},
) =>
	new Bookmarks({
		baseUrl: 'http://bookmarks.test',
		operations,
		http: { fetch, retry: false },
		...options,
	});
const failure = (call: Promise<unknown>) =>
	call.then(
		() => undefined,
		(caught: unknown) => caught,
	);

beforeEach(() => defaultCache.clear());

describe('RESTDataSource', () => {
	it("calls the service by path, typed by its spec, and returns the 2xx reply's data", async () => {
		const { fetch, sent } = service();
		const bookmarks = source(fetch);
		const bookmark: Bookmark = await bookmarks.bookmark('b1');
		expect(bookmark).toEqual({ id: 'b1', url: 'https://example.com/1' });
		expect(await bookmarks.create('https://x.test')).toEqual({
			id: 'new',
			url: 'https://example.com/2',
		});
		expect(sent.map(route)).toEqual(['GET /bookmarks/b1', 'POST /bookmarks']);
	});

	it('pages as a Relay connection', async () => {
		const { fetch, sent } = service();
		expect(await source(fetch).page()).toEqual({
			edges: [{ node: { id: 'b1', url: 'https://example.com' }, cursor: 'b1' }],
			pageInfo: { hasNextPage: false, totalElements: 1 },
		});
		expect(new URL(sent[0]?.url ?? '').search).toBe('?first=10');
	});

	it("forwards the caller's token, awaited before each request", async () => {
		const { fetch, sent } = service();
		await source(fetch, { token: async () => 'caller' }).bookmark('b1');
		await source(fetch, { token: 'service' }).bookmark('b1');
		await source(fetch).bookmark('b1');
		expect(sent.map((request) => request.headers.get('authorization'))).toEqual(
			['Bearer caller', 'Bearer service', null],
		);
	});

	it('shares its cache between datasources, never between callers', async () => {
		const { fetch, sent } = service();
		const first = await source(fetch, { token: 'a' }).bookmark('b1');
		expect(await source(fetch, { token: 'a' }).bookmark('b1')).toEqual(first);
		expect(await source(fetch, { token: 'b' }).bookmark('b1')).not.toEqual(
			first,
		);
		expect(sent.length).toBe(2);
		defaultCache.clear();
		await source(fetch, { token: 'a' }).bookmark('b1');
		expect(sent.length).toBe(3);
	});

	it('caches reads, a QUERY by what it searches for, and no write', async () => {
		const { fetch, sent } = service();
		const bookmarks = source(fetch);
		const found = await bookmarks.search('a');
		expect(await bookmarks.search('a')).toEqual(found);
		expect(await bookmarks.search('b')).not.toEqual(found);
		for (let i = 0; i < 2; i++) {
			await bookmarks.update('b1', 'https://x.test');
			await bookmarks.create('https://y.test');
		}
		expect(sent.map(route)).toEqual([
			'QUERY /bookmarks',
			'QUERY /bookmarks',
			'PUT /bookmarks/b1',
			'POST /bookmarks',
			'PUT /bookmarks/b1',
			'POST /bookmarks',
		]);
	});

	it('takes a cache of its own, or none', async () => {
		const { fetch, sent } = service();
		const own = cache({ ttl: 1_000 });
		await source(fetch, { cache: own }).bookmark('b1');
		await source(fetch, { cache: own }).bookmark('b1');
		await source(fetch, { cache: false }).bookmark('b1');
		await source(fetch, { cache: false }).bookmark('b1');
		expect(sent.length).toBe(3);
	});

	it('throws a DataSourceError for a declared error reply, with its message and body', async () => {
		const { fetch } = service();
		const error = await failure(source(fetch).bookmark('missing'));
		expect(error).toBeInstanceOf(DataSourceError);
		expect(error).toMatchObject({
			code: 'NOT_FOUND',
			status: 404,
			message: 'errors.bookmark-not-found',
			data: { message: 'errors.bookmark-not-found' },
			extensions: { code: 'NOT_FOUND', status: 404 },
		});
	});

	it('reads the body of a reply the spec does not declare', async () => {
		const { fetch } = service();
		expect(await failure(source(fetch).bookmark('private'))).toMatchObject({
			code: 'UNAUTHENTICATED',
			status: 401,
			message: 'errors.unauthenticated',
		});
		expect(await failure(source(fetch).bookmark('broken'))).toMatchObject({
			code: 'INTERNAL_SERVER_ERROR',
			status: 503,
			data: 'down',
		});
	});

	it('is SERVICE_UNAVAILABLE when no reply comes back, and lets an abort through', async () => {
		const down = source(async () => {
			throw new TypeError('fetch failed');
		});
		expect(await failure(down.bookmark('b1'))).toMatchObject({
			code: 'SERVICE_UNAVAILABLE',
			status: undefined,
		});

		const hanging = source(
			(request) =>
				new Promise<Response>((_, reject) =>
					request.signal.addEventListener('abort', () =>
						reject(request.signal.reason),
					),
				),
		);
		const controller = new AbortController();
		const call = failure(
			hanging.data(
				hanging.api.get(
					'/bookmarks/{id}',
					{ param: { id: 'b1' } },
					{ signal: controller.signal },
				),
			),
		);
		controller.abort();
		const aborted = await call;
		expect(isAbortError(aborted)).toBe(true);
		expect(aborted).not.toBeInstanceOf(DataSourceError);
	});

	it('refuses, at compile time, a path or a method the spec lacks', () => {
		const bookmarks = source(async () => new Response(null));
		const never = () => {
			// @ts-expect-error the spec has no such path
			bookmarks.get('/nope');
			// @ts-expect-error nor any TRACE operation
			bookmarks.trace;
			// @ts-expect-error on the client either
			return bookmarks.api.trace;
		};
		expect(never).toBeFunction();
		// Nor at runtime: only the spec's methods are there.
		expect('trace' in bookmarks).toBe(false);
		expect('trace' in bookmarks.api).toBe(false);
		expect(bookmarks.get).toBeFunction();
	});

	it('binds a class to the generated table, its types taken from it', async () => {
		const { fetch, sent } = service();
		const http = { fetch, retry: false as const };
		class Bound extends RESTDataSource.for(operations) {
			bookmark(id: string) {
				return this.data(this.get('/bookmarks/{id}', { param: { id } }));
			}
		}
		const bound = new Bound({ baseUrl: 'http://bookmarks.test', http });
		const bookmark: Bookmark = await bound.bookmark('b1');
		expect(bookmark).toMatchObject({ id: 'b1' });
		expect(bound).toBeInstanceOf(RESTDataSource);

		const Wire = RESTDataSource.for(operations, { decode: false });
		const wire = new Wire({ baseUrl: 'http://bookmarks.test', http });
		const read = await wire.data(
			wire.get('/bookmarks/{id}', { param: { id: 'b2' } }),
		);
		expect(read.id).toBe('b2');
		expect(sent.map(route)).toEqual(['GET /bookmarks/b1', 'GET /bookmarks/b2']);
	});

	it("leaves a subclass's own method named after a method the spec lacks", async () => {
		const { fetch, sent } = service();
		class Traced extends RESTDataSource<ClientOperations> {
			trace() {
				return 'mine';
			}
		}
		const traced = new Traced({
			baseUrl: 'http://bookmarks.test',
			operations,
			http: { fetch, retry: false },
		});
		expect(traced.trace()).toBe('mine');
		expect(traced).toBeInstanceOf(RESTDataSource);
		expect(
			await traced.data(traced.get('/bookmarks/{id}', { param: { id: 'b1' } })),
		).toMatchObject({ id: 'b1' });
		expect(sent.map(route)).toEqual(['GET /bookmarks/b1']);
	});
});
