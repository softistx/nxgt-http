import { beforeAll, describe, expect, expectTypeOf, test } from 'bun:test';
import { client as httpClient } from '@alxia/client';
import { alxia } from '@alxia/core';
import { rateLimit } from '@alxia/rate-limit';
import { defineCache } from '@nxgt/redis';
import { z } from 'zod';
import { useRedis } from '../test/server';
import { redis } from './context';
import { idempotency } from './idempotency';
import { redisStore } from './store';

const db = useRedis();

describe('redisStore', () => {
	test('two apps sharing a Redis share a count, typed 429 and all', async () => {
		const make = () =>
			alxia({ ip: () => '1.2.3.4' })
				.use(
					rateLimit({
						limit: 2,
						windowMs: 60_000,
						store: redisStore(db.client, { name: 'api' }),
					}),
				)
				.get('/', ({ reply }) => reply(200, 'ok'));
		const [one, two] = [make(), make()];
		expect((await one.request('/')).status).toBe(200);
		expect((await two.request('/')).status).toBe(200);
		const third = await httpClient(one).get('/');
		expect(third.status).toBe(429);
		if (third.status === 429) expect(third.data.retryAfter).toBeGreaterThan(0);
		expect(third.response.headers.get('ratelimit-remaining')).toBe('0');
	});

	test('reset forgets a key', async () => {
		const store = redisStore(db.client, { name: 'reset' });
		const policy = { limit: 1, windowMs: 60_000 };
		expect((await store.consume('k', policy)).allowed).toBe(true);
		expect((await store.consume('k', policy)).allowed).toBe(false);
		await store.reset('k');
		expect((await store.consume('k', policy)).allowed).toBe(true);
	});
});

let runs = 0;
const makeApp = () =>
	alxia({ ip: () => '1.2.3.4' })
		.post('/open', ({ reply }) => reply(201, ++runs))
		.use(idempotency(db.client, { name: 'payments' }))
		.post(
			'/payments',
			{ body: z.object({ amount: z.number() }) },
			async ({ body, reply, set }) => {
				runs++;
				set.cookies.set('seen', 'yes');
				await Bun.sleep(40);
				return reply(201, { id: runs, amount: body.amount });
			},
		)
		.post('/fails', () => {
			throw new Error('down');
		});

describe('idempotency', () => {
	// Built once Redis is up: a plugin binds its client when it is made.
	let app: ReturnType<typeof makeApp>;
	beforeAll(() => {
		app = makeApp();
	});

	const pay = (key: string | undefined, amount = 10) =>
		app.request('/payments', {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				...(key === undefined ? {} : { 'idempotency-key': key }),
			},
			body: JSON.stringify({ amount }),
		});

	test('a key runs once; a repeat replays the first response', async () => {
		runs = 0;
		const first = await pay('k-1');
		const again = await pay('k-1');
		expect(first.status).toBe(201);
		expect(await again.json()).toEqual({ id: 1, amount: 10 });
		expect(again.headers.get('idempotent-replayed')).toBe('true');
		expect(again.headers.get('set-cookie')).toBeNull();
		expect(runs).toBe(1);
		await pay(undefined);
		expect(runs).toBe(2);
	});

	test('a repeat while the first runs is a 409; another request with the key a 422', async () => {
		const [first, concurrent] = await Promise.all([pay('k-2'), pay('k-2')]);
		expect([first.status, concurrent.status].sort()).toEqual([201, 409]);
		const reused = await pay('k-2', 99);
		expect(reused.status).toBe(422);
		expect(await reused.json()).toEqual({ error: 'idempotency_key_reused' });
	});

	test('a 5xx is not kept: the key is free again', async () => {
		const original = console.error;
		console.error = () => {};
		try {
			const call = () =>
				app.request('/fails', {
					method: 'POST',
					headers: { 'idempotency-key': 'k-3' },
				});
			expect((await call()).status).toBe(500);
			expect((await call()).headers.get('idempotent-replayed')).toBeNull();
		} finally {
			console.error = original;
		}
	});

	test('its refusals are in the types of the routes after it only', () => {
		const _types = async () => {
			const api = httpClient(app);
			const result = await api.post('/payments', { body: { amount: 1 } });
			expectTypeOf(result.status).toEqualTypeOf<201 | 400 | 409 | 422 | 500>();
			const open = await api.post('/open');
			expectTypeOf(open.status).toEqualTypeOf<201 | 500>();
		};
		expect(_types).toBeFunction();
	});
});

describe('redis', () => {
	const User = z.object({ id: z.string(), name: z.string() });
	const users = defineCache({
		name: 'user',
		key: (id: string) => id,
		ttl: 60,
		schema: User,
	});

	test('caches and a lock in the context, typed', async () => {
		let loads = 0;
		const app = alxia()
			.use(redis(db.client, { caches: { users } }))
			.get('/users/:id', async ({ cache, lock, params, reply }) => {
				const user = await cache.users.remember(params.id, () => {
					loads++;
					return { id: params.id, name: 'Ada' };
				});
				expectTypeOf(user).toEqualTypeOf<{ id: string; name: string }>();
				const locked = await lock(`user:${params.id}`, () => 'locked');
				return reply(200, { ...user, locked });
			});
		await app.request('/users/1');
		const second = await app.request('/users/1');
		expect(await second.json()).toEqual({
			id: '1',
			name: 'Ada',
			locked: 'locked',
		});
		expect(loads).toBe(1);
	});
});

describe('redisCacheStore', () => {
	test('two apps share kept responses, and forget them by tag', async () => {
		const { cache } = await import('@alxia/cache');
		const { redisCacheStore } = await import('./cache-store');
		let runs = 0;
		const make = () => {
			const products = cache({
				ttl: 60,
				store: redisCacheStore(db.client, { name: 'shop' }),
				tags: () => ['products'],
			});
			return {
				products,
				app: alxia()
					.use(products)
					.get('/products', ({ reply }) => reply(200, { runs: ++runs })),
			};
		};
		const one = make();
		const two = make();
		await one.app.request('/products');
		const shared = await two.app.request('/products');
		expect(shared.headers.get('x-cache')).toBe('HIT');
		expect(await shared.json()).toEqual({ runs: 1 });
		await two.products.invalidateTag('products');
		expect(await (await one.app.request('/products')).json()).toEqual({
			runs: 2,
		});
	});
});
