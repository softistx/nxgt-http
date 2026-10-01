/** What a store decides for one request. Every duration is a delay, in milliseconds. */
export interface Decision {
	readonly allowed: boolean;
	/** Requests the key may still make now, after this one. */
	readonly remaining: number;
	/** Until the key's allowance is whole again. */
	readonly resetAfter: number;
	/** Until a refused request would be allowed; 0 when this one is. */
	readonly retryAfter: number;
}

/** The policy a store applies: `limit` requests per `windowMs`. */
export interface Policy {
	readonly limit: number;
	readonly windowMs: number;
}

/**
 * Where requests are counted, and what decides. The memory store counts in
 * one process with a fixed window; `@alxia/redis`'s counts across every
 * process sharing a Redis, with GCRA.
 */
export interface RateLimitStore {
	/** Counts one request for `key` under `policy`; a refused one counts nothing. */
	consume(key: string, policy: Policy): Decision | Promise<Decision>;
	/** Forgets `key`: a user who just logged in. */
	reset(key: string): void | Promise<void>;
}

/** A fixed-window counter in memory, swept as windows end. */
export class MemoryStore implements RateLimitStore {
	readonly #hits = new Map<string, { count: number; resetAt: number }>();
	#sweeper: ReturnType<typeof setInterval> | undefined;

	consume(key: string, policy: Policy): Decision {
		const now = Date.now();
		let entry = this.#hits.get(key);
		if (entry === undefined || entry.resetAt <= now) {
			entry = { count: 0, resetAt: now + policy.windowMs };
			this.#hits.set(key, entry);
		}
		this.#sweep(policy.windowMs);
		const resetAfter = entry.resetAt - now;
		if (entry.count >= policy.limit) {
			return {
				allowed: false,
				remaining: 0,
				resetAfter,
				retryAfter: resetAfter,
			};
		}
		entry.count++;
		return {
			allowed: true,
			remaining: policy.limit - entry.count,
			resetAfter,
			retryAfter: 0,
		};
	}

	reset(key: string): void {
		this.#hits.delete(key);
	}

	/** How many keys are counted. */
	get size(): number {
		return this.#hits.size;
	}

	#sweep(windowMs: number): void {
		if (this.#sweeper !== undefined) return;
		this.#sweeper = setInterval(() => {
			const now = Date.now();
			for (const [key, entry] of this.#hits) {
				if (entry.resetAt <= now) this.#hits.delete(key);
			}
			if (this.#hits.size === 0) {
				clearInterval(this.#sweeper);
				this.#sweeper = undefined;
			}
		}, windowMs);
		this.#sweeper.unref?.();
	}
}
