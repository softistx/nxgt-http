/** How many hits a key has had in its current window, and when that window ends. */
export interface Hits {
	readonly count: number;
	/** Milliseconds since the epoch. */
	readonly resetAt: number;
}

/**
 * Where hits are counted. The memory store counts in one process; a store
 * over Redis or a database counts across many.
 */
export interface RateLimitStore {
	/** Counts one hit for `key`, in a window of `windowMs`. */
	hit(key: string, windowMs: number): Hits | Promise<Hits>;
	/** Forgets `key`: a user who just logged in. */
	reset(key: string): void | Promise<void>;
}

/** A fixed-window counter in memory, swept as windows end. */
export class MemoryStore implements RateLimitStore {
	readonly #hits = new Map<string, { count: number; resetAt: number }>();
	#sweeper: ReturnType<typeof setInterval> | undefined;

	hit(key: string, windowMs: number): Hits {
		const now = Date.now();
		let entry = this.#hits.get(key);
		if (entry === undefined || entry.resetAt <= now) {
			entry = { count: 0, resetAt: now + windowMs };
			this.#hits.set(key, entry);
		}
		entry.count++;
		this.#sweep(windowMs);
		return { count: entry.count, resetAt: entry.resetAt };
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
