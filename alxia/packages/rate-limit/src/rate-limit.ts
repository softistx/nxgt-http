import { alxia, type BaseContext } from '@alxia/core';
import { MemoryStore, type RateLimitStore } from './store';

export interface RateLimitOptions {
	/** How many requests a key may make in a window. */
	readonly limit: number;
	/** The window, in milliseconds. */
	readonly windowMs: number;
	/** What is counted: the client's address by default. `undefined` is not counted. */
	readonly key?: (
		ctx: BaseContext,
	) => string | undefined | Promise<string | undefined>;
	/** Where it is counted: one process's memory by default. */
	readonly store?: RateLimitStore;
	/** Requests not counted at all. */
	readonly skip?: (ctx: BaseContext) => boolean;
	/**
	 * The `RateLimit` headers of the IETF draft on every counted response,
	 * `X-RateLimit-*` with `legacy`, or none. `draft` by default.
	 */
	readonly headers?: 'draft' | 'legacy' | false;
}

/** The body of the 429. */
export interface RateLimitedBody {
	readonly error: 'rate_limited';
	/** Seconds until the window ends. */
	readonly retryAfter: number;
}

/** What the routes behind the limit read: where the key stands. */
export interface RateLimitInfo {
	readonly limit: number;
	readonly remaining: number;
	readonly resetAt: number;
}

/**
 * A rate limit, as a plugin: every route declared after it counts its
 * requests, and answers a 429 past the limit. The 429 is part of each such
 * route's type, so the client reads it.
 *
 * ```ts
 * app.use(rateLimit({ limit: 100, windowMs: 60_000 })).get(...);
 * ```
 */
export function rateLimit(options: RateLimitOptions) {
	const store = options.store ?? new MemoryStore();
	const key = options.key ?? ((ctx: BaseContext) => ctx.ip);
	const style = options.headers ?? 'draft';
	return alxia().derive(async (ctx) => {
		const counted = options.skip?.(ctx) ? undefined : await key(ctx);
		if (counted === undefined) {
			const rateLimit: RateLimitInfo | undefined = undefined;
			return { rateLimit };
		}
		const hits = await store.hit(counted, options.windowMs);
		const remaining = Math.max(0, options.limit - hits.count);
		const reset = Math.max(0, Math.ceil((hits.resetAt - Date.now()) / 1000));
		if (style === 'draft') {
			ctx.set.headers.set('ratelimit-limit', String(options.limit));
			ctx.set.headers.set('ratelimit-remaining', String(remaining));
			ctx.set.headers.set('ratelimit-reset', String(reset));
			ctx.set.headers.set(
				'ratelimit-policy',
				`${options.limit};w=${Math.ceil(options.windowMs / 1000)}`,
			);
		} else if (style === 'legacy') {
			ctx.set.headers.set('x-ratelimit-limit', String(options.limit));
			ctx.set.headers.set('x-ratelimit-remaining', String(remaining));
			ctx.set.headers.set(
				'x-ratelimit-reset',
				String(Math.ceil(hits.resetAt / 1000)),
			);
		}
		if (hits.count > options.limit) {
			const body: RateLimitedBody = {
				error: 'rate_limited',
				retryAfter: reset,
			};
			return ctx.reply(429, body, {
				headers: { 'retry-after': String(reset) },
			});
		}
		const rateLimit: RateLimitInfo | undefined = {
			limit: options.limit,
			remaining,
			resetAt: hits.resetAt,
		};
		return { rateLimit };
	});
}
