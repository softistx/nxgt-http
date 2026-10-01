/** A response as a store keeps it. */
export interface CachedResponse {
	readonly status: number;
	readonly headers: readonly (readonly [string, string])[];
	readonly body: Uint8Array;
	/** Milliseconds since the epoch. */
	readonly storedAt: number;
	/** Milliseconds it is fresh for, from `storedAt`. */
	readonly ttl: number;
	/** Milliseconds it may be served stale after, while it is refreshed. */
	readonly stale: number;
	readonly tags: readonly string[];
}

/**
 * Where responses are kept. The memory store keeps them in one process;
 * `@alxia/redis`'s `redisCacheStore` across every process sharing a Redis.
 */
export interface CacheStore {
	get(
		key: string,
	): Promise<CachedResponse | undefined> | CachedResponse | undefined;
	/** Keeps `value` for `keepFor` milliseconds: its freshness and its staleness together. */
	set(
		key: string,
		value: CachedResponse,
		keepFor: number,
	): Promise<void> | void;
	delete(key: string): Promise<void> | void;
	/** Forgets every response tagged `tag`. */
	deleteTag(tag: string): Promise<void> | void;
}

export interface MemoryCacheOptions {
	/** The most responses kept: the least recently read goes first. 1 000 by default. */
	readonly maxEntries?: number;
	/** The most bytes of bodies kept. 64 MiB by default. */
	readonly maxBytes?: number;
}

/** A least-recently-used store in one process's memory. */
export class MemoryCacheStore implements CacheStore {
	readonly #entries = new Map<
		string,
		{ value: CachedResponse; expiresAt: number }
	>();
	readonly #tags = new Map<string, Set<string>>();
	readonly #maxEntries: number;
	readonly #maxBytes: number;
	#bytes = 0;

	constructor(options: MemoryCacheOptions = {}) {
		this.#maxEntries = options.maxEntries ?? 1_000;
		this.#maxBytes = options.maxBytes ?? 64 * 1024 * 1024;
	}

	get(key: string): CachedResponse | undefined {
		const entry = this.#entries.get(key);
		if (entry === undefined) return undefined;
		if (entry.expiresAt <= Date.now()) {
			this.delete(key);
			return undefined;
		}
		// Read again: the most recently used goes to the end.
		this.#entries.delete(key);
		this.#entries.set(key, entry);
		return entry.value;
	}

	set(key: string, value: CachedResponse, keepFor: number): void {
		this.delete(key);
		if (value.body.byteLength > this.#maxBytes) return;
		this.#entries.set(key, { value, expiresAt: Date.now() + keepFor });
		this.#bytes += value.body.byteLength;
		for (const tag of value.tags) {
			let keys = this.#tags.get(tag);
			if (keys === undefined) {
				keys = new Set();
				this.#tags.set(tag, keys);
			}
			keys.add(key);
		}
		for (const oldest of this.#entries.keys()) {
			if (
				this.#entries.size <= this.#maxEntries &&
				this.#bytes <= this.#maxBytes
			)
				break;
			this.delete(oldest);
		}
	}

	delete(key: string): void {
		const entry = this.#entries.get(key);
		if (entry === undefined) return;
		this.#entries.delete(key);
		this.#bytes -= entry.value.body.byteLength;
		for (const tag of entry.value.tags) {
			const keys = this.#tags.get(tag);
			keys?.delete(key);
			if (keys?.size === 0) this.#tags.delete(tag);
		}
	}

	deleteTag(tag: string): void {
		for (const key of [...(this.#tags.get(tag) ?? [])]) this.delete(key);
	}

	/** How many responses are kept. */
	get size(): number {
		return this.#entries.size;
	}
}
