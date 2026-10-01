import { alxia } from '@alxia/core';
import {
	type BoundCache,
	bindCache,
	type CacheDefinition,
	type LockOptions,
	withLock,
} from '@nxgt/redis';
import type { RedisClient } from 'bun';
import type { z } from 'zod';

type AnyCache = CacheDefinition<any, z.ZodType>;

/** The caches of `Caches`, each bound to the client. */
export type BoundCaches<Caches extends Record<string, AnyCache>> = {
	readonly [Name in keyof Caches]: Caches[Name] extends CacheDefinition<
		infer Params,
		infer Schema
	>
		? BoundCache<Params, z.output<Schema>, z.input<Schema>>
		: never;
};

export interface RedisContextOptions<Caches extends Record<string, AnyCache>> {
	/** `@nxgt/redis` cache definitions, by the name routes read them under. */
	readonly caches?: Caches;
}

/** What routes after `redis()` read. */
export interface RedisContext<Caches extends Record<string, AnyCache>> {
	/** Bun's own client, untouched. */
	readonly redis: RedisClient;
	/** Each cache, bound and typed by its schema. */
	readonly cache: BoundCaches<Caches>;
	/** `work` under a lock every process sharing the Redis respects: `@nxgt/redis`'s `withLock`. */
	lock<T>(
		key: string,
		work: () => Promise<T> | T,
		options?: LockOptions,
	): Promise<T>;
}

/**
 * Redis in the context, as a plugin: the client, the caches bound once, and
 * a lock — typed, for every route declared after it.
 *
 * ```ts
 * const users = defineCache({ name: 'user', key: (id: string) => id, ttl: 300, schema: User });
 * app.use(redis(connection.client, { caches: { users } }))
 *    .get('/users/:id', ({ cache, params, reply }) => reply(200, await cache.users.remember(params.id, load)));
 * ```
 */
export function redis<
	const Caches extends Record<string, AnyCache> = Record<never, never>,
>(client: RedisClient, options: RedisContextOptions<Caches> = {}) {
	const cache = Object.fromEntries(
		Object.entries(options.caches ?? {}).map(([name, definition]) => [
			name,
			bindCache(client, definition),
		]),
	) as BoundCaches<Caches>;
	const context: RedisContext<Caches> = {
		redis: client,
		cache,
		lock: (key, work, lockOptions) => withLock(client, key, work, lockOptions),
	};
	return alxia().decorate(context);
}
