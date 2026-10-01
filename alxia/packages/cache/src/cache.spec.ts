import { describe, expect, expectTypeOf, test } from 'bun:test';
import { alxia } from '@alxia/core';
import { cache } from './cache';
import { MemoryCacheStore } from './store';

function setup(options: Partial<Parameters<typeof cache>[0]> = {}) {
	let runs = 0;
	const products = cache({ ttl: 60, tags: () => ['products'], ...options });
	const app = alxia()
		.get('/live', ({ reply }) => reply(200, ++runs))
		.use(products)
		.get('/products', async ({ reply, cache: controls }) => {
			expectTypeOf(controls.tag).toBeFunction();
			await Bun.sleep(20);
			return reply(200, { runs: ++runs });
		})
		.get('/private', ({ reply }) =>
			reply(200, ++runs, { headers: { 'cache-control': 'private' } }),
		)
		.get('/skipped', ({ reply, cache: controls }) => {
			controls.skip();
			return reply(200, ++runs);
		})
		.get('/missing', ({ reply }) => reply(404, ++runs))
		.get('/hello', ({ request, reply }) =>
			reply(200, `${request.headers.get('accept-language') ?? '-'} ${++runs}`),
		);
	return { app, products, runs: () => runs };
}

describe('cache', () => {
	test('a fresh response is served again, with its ETag and a 304', async () => {
		const { app, runs } = setup();
		const first = await app.request('/products');
		expect(first.headers.get('x-cache')).toBe('MISS');
		const again = await app.request('/products');
		expect(await again.json()).toEqual({ runs: 1 });
		expect(again.headers.get('x-cache')).toBe('HIT');
		expect(runs()).toBe(1);
		const etag = again.headers.get('etag') ?? '';
		expect(etag).toStartWith('W/"');
		const notModified = await app.request('/products', {
			headers: { 'if-none-match': etag },
		});
		expect(notModified.status).toBe(304);
	});

	test('concurrent misses run the route once', async () => {
		const { app, runs } = setup();
		const answers = await Promise.all(
			Array.from({ length: 10 }, async () =>
				(await app.request('/products')).json(),
			),
		);
		expect(answers.every((answer) => answer.runs === 1)).toBe(true);
		expect(runs()).toBe(1);
	});

	test('stale: served at once, refreshed behind', async () => {
		const { app, runs } = setup({ ttl: 0.05, staleWhileRevalidate: 60 });
		await app.request('/products');
		await Bun.sleep(80);
		const stale = await app.request('/products');
		expect(stale.headers.get('x-cache')).toBe('STALE');
		expect(await stale.json()).toEqual({ runs: 1 });
		await Bun.sleep(50);
		expect(runs()).toBe(2);
		expect(await (await app.request('/products')).json()).toEqual({ runs: 2 });
	});

	test('never kept: private, skipped, another status; routes before it', async () => {
		const { app, runs } = setup();
		for (const path of ['/private', '/skipped', '/missing', '/live']) {
			await app.request(path);
			await app.request(path);
		}
		expect(runs()).toBe(8);
	});

	test('varying by a header', async () => {
		const { app } = setup({ vary: ['accept-language'] });
		const fr = await app.request('/hello', {
			headers: { 'accept-language': 'fr' },
		});
		const en = await app.request('/hello', {
			headers: { 'accept-language': 'en' },
		});
		expect(await fr.text()).toStartWith('fr');
		expect(await en.text()).toStartWith('en');
		expect(fr.headers.get('vary')).toContain('accept-language');
		expect(
			await (
				await app.request('/hello', { headers: { 'accept-language': 'fr' } })
			).text(),
		).toBe(
			await (
				await app.request('/hello', { headers: { 'accept-language': 'fr' } })
			).text(),
		);
	});

	test('invalidated by path, and by tag', async () => {
		const { app, products, runs } = setup();
		await app.request('/products');
		await products.invalidate('/products');
		await app.request('/products');
		expect(runs()).toBe(2);
		await products.invalidateTag('products');
		await app.request('/products');
		expect(runs()).toBe(3);
	});
});

describe('MemoryCacheStore', () => {
	const entry = (bytes: number, tags: string[] = []) => ({
		status: 200,
		headers: [],
		body: new Uint8Array(bytes),
		storedAt: Date.now(),
		ttl: 1000,
		stale: 0,
		tags,
	});

	test('evicts the least recently read, by count and by bytes', () => {
		const store = new MemoryCacheStore({ maxEntries: 2, maxBytes: 100 });
		store.set('a', entry(10), 1000);
		store.set('b', entry(10), 1000);
		store.get('a');
		store.set('c', entry(10), 1000);
		expect(store.get('b')).toBeUndefined();
		expect(store.get('a')).toBeDefined();
		store.set('d', entry(95), 1000);
		expect(store.size).toBe(1);
	});

	test('expires, and forgets by tag', async () => {
		const store = new MemoryCacheStore();
		store.set('a', entry(1, ['t']), 10);
		store.set('b', entry(1, ['t']), 1000);
		await Bun.sleep(20);
		expect(store.get('a')).toBeUndefined();
		store.deleteTag('t');
		expect(store.get('b')).toBeUndefined();
	});
});
