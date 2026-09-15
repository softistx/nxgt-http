/**
 * Replies kept in memory, as a middleware: a request made again while its
 * reply is fresh is answered from memory, and `fetch` is never called.
 *
 * Its key is the request's method, URL, the headers in `vary`
 * (`authorization` by default, so no caller is answered with another's
 * reply), and its body, when it has one: a `QUERY` is cached by what it
 * searches for.
 */
import type { CallContext } from '../errors/errors';
import type { Middleware } from './compose';

export interface CacheOptions {
	/** Milliseconds a reply stays fresh. Default: 5 minutes. */
	ttl?: number;
	/** At most this many replies, the least recently used dropped first. Default: 500. */
	maxEntries?: number;
	/**
	 * Which requests are cached. Default: the reads, `GET`, `HEAD` and
	 * `QUERY`, whose body is part of the key.
	 */
	cacheable?: (request: Request, call: CallContext) => boolean;
	/**
	 * The request headers that tell two replies apart. Default:
	 * `['authorization']`. Add `accept-language` for a localized API.
	 */
	vary?: readonly string[];
}

/** The middleware, and a way to empty it: after a write, for one. */
export type Cache = Middleware & { clear(): void };

interface Entry {
	readonly expiry: number;
	/** Never read: each hit is a clone of it. */
	readonly response: Response;
}

const READS = new Set(['GET', 'HEAD', 'QUERY']);
const reads = (request: Request) => READS.has(request.method.toUpperCase());

/**
 * A cache of `ok` replies, for `use`. One cache is one store: share the
 * middleware to share the store, as datasources made per request do.
 *
 * ```ts
 * const replies = cache({ ttl: 30_000 });
 * createHttpClient({ baseUrl, use: [replies] });
 * ```
 */
export function cache({
	ttl = 5 * 60 * 1000,
	maxEntries = 500,
	cacheable = reads,
	vary = ['authorization'],
}: CacheOptions = {}): Cache {
	const entries = new Map<string, Entry>();
	const keyOf = async (request: Request): Promise<string> => {
		const parts = [
			request.method,
			request.url,
			...vary.map((name) => `${name}: ${request.headers.get(name) ?? ''}`),
		];
		// A clone's: the request is still sent with its own body.
		if (request.body !== null) parts.push(await request.clone().text());
		return JSON.stringify(parts);
	};
	const middleware: Middleware = async (request, next, call) => {
		if (!cacheable(request, call)) return next(request);
		const key = await keyOf(request);
		const hit = entries.get(key);
		entries.delete(key);
		if (hit && hit.expiry > Date.now()) {
			// Last in the map is the most recently used: the first is dropped first.
			entries.set(key, hit);
			return hit.response.clone();
		}
		const response = await next(request);
		if (!response.ok) return response;
		entries.set(key, { expiry: Date.now() + ttl, response: response.clone() });
		for (const oldest of entries.keys()) {
			if (entries.size <= maxEntries) break;
			entries.delete(oldest);
		}
		return response;
	};
	return Object.assign(middleware, { clear: () => entries.clear() });
}
