/** `cache()`: replies answered from memory, keyed so that no caller gets another's. */
import { describe, expect, it } from 'bun:test';
import { cache, createHttpClient, type HttpClientOptions } from '../index';

/** A fetch that counts its requests and echoes what it was sent. */
function server() {
	const seen: Request[] = [];
	const fetch = async (request: Request): Promise<Response> => {
		seen.push(request);
		const { pathname } = new URL(request.url);
		if (pathname === '/missing') return new Response(null, { status: 404 });
		return Response.json({
			n: seen.length,
			body: request.body === null ? null : await request.text(),
		});
	};
	return { fetch, seen };
}
const client = (
	fetch: (request: Request) => Promise<Response>,
	options: HttpClientOptions = {},
) => createHttpClient({ baseUrl: 'http://api.test', fetch, ...options });
const data = async (reply: Promise<{ readonly data: unknown }>) =>
	(await reply).data;

describe('cache', () => {
	it('answers a GET made again from memory while its reply is fresh', async () => {
		const { fetch, seen } = server();
		const http = client(fetch, { use: [cache({ ttl: 40 })] });
		expect(await data(http.get('/items'))).toEqual({ n: 1, body: null });
		expect(await data(http.get('/items'))).toEqual({ n: 1, body: null });
		expect(await data(http.get('/items', { query: { page: 2 } }))).toEqual({
			n: 2,
			body: null,
		});
		await Bun.sleep(50);
		expect(await data(http.get('/items'))).toEqual({ n: 3, body: null });
		expect(seen.length).toBe(3);
	});

	it('keeps apart the replies of two callers, by their authorization', async () => {
		const { fetch, seen } = server();
		const replies = cache();
		let token = 'a';
		const http = client(fetch, {
			use: [replies],
			auth: { token: async () => token },
		});
		await http.get('/me');
		token = 'b';
		expect(await data(http.get('/me'))).toEqual({ n: 2, body: null });
		token = 'a';
		expect(await data(http.get('/me'))).toEqual({ n: 1, body: null });
		expect(seen.map((request) => request.headers.get('authorization'))).toEqual(
			['Bearer a', 'Bearer b'],
		);
	});

	it('caches a POST only when asked, keyed by its body', async () => {
		const { fetch, seen } = server();
		const plain = client(fetch, { use: [cache()] });
		await plain.post('/search', { json: { q: 'a' } });
		await plain.post('/search', { json: { q: 'a' } });
		expect(seen.length).toBe(2);

		const searches = client(fetch, {
			use: [
				cache({
					cacheable: (request, call) =>
						request.method === 'GET' || call.path === '/search',
				}),
			],
		});
		const first = await data(searches.post('/search', { json: { q: 'a' } }));
		expect(await data(searches.post('/search', { json: { q: 'a' } }))).toEqual(
			first,
		);
		expect(await data(searches.post('/search', { json: { q: 'b' } }))).toEqual({
			n: 4,
			body: '{"q":"b"}',
		});
	});

	it('keeps no reply that is not ok', async () => {
		const { fetch, seen } = server();
		const http = client(fetch, { use: [cache()] });
		for (let i = 0; i < 2; i++) {
			expect((await http.get('/missing')).status).toBe(404);
		}
		expect(seen.length).toBe(2);
	});

	it('drops the least recently used reply past maxEntries, and empties on clear()', async () => {
		const { fetch, seen } = server();
		const replies = cache({ maxEntries: 2 });
		const http = client(fetch, { use: [replies] });
		await http.get('/a');
		await http.get('/b');
		await http.get('/a'); // a is now more recent than b
		await http.get('/c'); // drops b
		expect(seen.length).toBe(3);
		await http.get('/a');
		expect(seen.length).toBe(3);
		await http.get('/b');
		expect(seen.length).toBe(4);

		replies.clear();
		await http.get('/a');
		expect(seen.length).toBe(5);
	});

	it('is one store for every client that shares it', async () => {
		const { fetch, seen } = server();
		const replies = cache();
		await client(fetch, { use: [replies] }).get('/items');
		await client(fetch, { use: [replies] }).get('/items');
		expect(seen.length).toBe(1);
	});
});
