import type { CachedResponse, CacheStore } from '@alxia/cache';
import { bindCache, defineCache } from '@nxgt/redis';
import type { RedisClient } from 'bun';
import { z } from 'zod';

export interface RedisCacheStoreOptions {
	/** Prepended to every key it writes: one name per app or deployment. */
	readonly name: string;
}

const Stored = z.object({
	status: z.number().int(),
	headers: z.array(z.tuple([z.string(), z.string()])),
	body: z.string(),
	storedAt: z.number(),
	ttl: z.number(),
	stale: z.number(),
	tags: z.array(z.string()),
});

/**
 * An `@alxia/cache` store in Redis, on `@nxgt/redis`'s typed caches: every
 * process sharing the Redis serves what one of them kept. A record that no
 * longer reads as a response is a miss, and is dropped. Tags are Redis sets
 * of the keys they name.
 *
 * ```ts
 * app.use(cache({ ttl: 60, store: redisCacheStore(connection.client, { name: 'shop' }) }));
 * ```
 */
export function redisCacheStore(
	client: RedisClient,
	options: RedisCacheStoreOptions,
): CacheStore {
	// `@nxgt/redis` keeps a record for whole seconds; the store's own `ttl`
	// and `stale` decide freshness to the millisecond.
	const records = bindCache(
		client,
		defineCache({
			name: `${options.name}:response`,
			key: (key: string) => key,
			ttl: 60,
			schema: Stored,
		}),
	);
	const tagKey = (tag: string) => `${options.name}:tag:${tag}`;

	return {
		async get(key) {
			const record = await records.get(key);
			if (record === undefined) return undefined;
			const response: CachedResponse = {
				...record,
				body: new Uint8Array(Buffer.from(record.body, 'base64')),
			};
			return response;
		},
		async set(key, value, keepFor) {
			const seconds = Math.max(1, Math.ceil(keepFor / 1000));
			await records.set(
				key,
				{
					...value,
					headers: value.headers.map(
						([name, header]) => [name, header] as [string, string],
					),
					tags: [...value.tags],
					body: Buffer.from(value.body).toString('base64'),
				},
				{ ttl: seconds },
			);
			for (const tag of value.tags) {
				await client.send('SADD', [tagKey(tag), records.keyFor(key)]);
				await client
					.send('EXPIRE', [tagKey(tag), String(seconds), 'GT'])
					.catch(() => client.send('EXPIRE', [tagKey(tag), String(seconds)]));
			}
		},
		async delete(key) {
			await records.delete(key);
		},
		async deleteTag(tag) {
			const keys = (await client.send('SMEMBERS', [tagKey(tag)])) as string[];
			if (keys.length > 0) await client.send('DEL', keys);
			await client.send('DEL', [tagKey(tag)]);
		},
	};
}
