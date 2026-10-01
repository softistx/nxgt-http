import type { Decision, Policy, RateLimitStore } from '@alxia/rate-limit';
import {
	type BoundRateLimit,
	bindRateLimit,
	defineRateLimit,
} from '@nxgt/redis-guard';
import type { RedisClient } from 'bun';

export interface RedisStoreOptions {
	/** Prepended to every key it counts: one name per limit, so two never share a count. */
	readonly name: string;
}

/**
 * An `@alxia/rate-limit` store in Redis, with `@nxgt/redis-guard`'s GCRA:
 * every process sharing the Redis counts together, timed by the Redis
 * server's clock, and a refused request counts nothing.
 *
 * ```ts
 * app.use(rateLimit({ limit: 100, windowMs: 60_000, store: redisStore(redis.client, { name: 'api' }) }));
 * ```
 */
export function redisStore(
	client: RedisClient,
	options: RedisStoreOptions,
): RateLimitStore {
	const limits = new Map<string, BoundRateLimit<string>>();
	const limitFor = (policy: Policy) => {
		const id = `${policy.limit}/${policy.windowMs}`;
		let bound = limits.get(id);
		if (bound === undefined) {
			bound = bindRateLimit(
				client,
				defineRateLimit({
					name: `${options.name}:${id}`,
					key: (key: string) => key,
					limit: policy.limit,
					per: policy.windowMs,
				}),
			);
			limits.set(id, bound);
		}
		return bound;
	};
	return {
		async consume(key, policy): Promise<Decision> {
			const result = await limitFor(policy).consume(key);
			return {
				allowed: result.allowed,
				remaining: result.remaining,
				resetAfter: result.resetAfter,
				retryAfter: result.retryAfter,
			};
		},
		async reset(key) {
			await Promise.all([...limits.values()].map((bound) => bound.reset(key)));
		},
	};
}
