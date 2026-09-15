/**
 * What the module's generated files call, at runtime, in Nitro and in the
 * app. Nothing here imports Nuxt, Nitro or h3: they reach it through the
 * templates, so it runs, and is tested, anywhere.
 */
import type { HttpClientOptions } from '@nxgt/httpyz';

/** Anything answering a web `Request`, as a Hono app does. */
export interface FetchApp<Env = unknown> {
	fetch(request: Request, env?: Env): Response | Promise<Response>;
}

/**
 * The request event's `fetch`, as h3 gives it: a call to the Nitro server
 * without leaving the process, which forwards the incoming request's cookies
 * and headers.
 */
export interface RequestEventLike {
	fetch?: (input: string, init?: RequestInit) => Promise<Response>;
}

/**
 * Answers `request` with `app`, the prefix taken off its path: under `/api`,
 * `/api/items/7` reaches the app as `/items/7`, as the spec names it. A path
 * outside the prefix reaches it unchanged.
 */
export function serveUnder<Env>(
	app: FetchApp<Env>,
	prefix: string,
	request: Request,
	env?: Env,
): Response | Promise<Response> {
	const url = new URL(request.url);
	const { pathname } = url;
	if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
		url.pathname = pathname.slice(prefix.length) || '/';
	}
	return app.fetch(new Request(url, request), env);
}

/** Where the bound client sends its calls: see `apiHttpOptions`. */
export interface ApiTarget {
	/** The path the server is mounted under, such as `/api`. */
	readonly prefix: string;
	/** The API elsewhere: every call goes there, from the server and the browser. */
	readonly baseUrl?: string;
	/** On the server, the request being rendered. */
	readonly event?: RequestEventLike;
	/** In the browser, the page's origin. Default: `location.origin`. */
	readonly origin?: string;
}

/** The host SSR calls are addressed to; only their path leaves the process. */
const LOCAL = 'http://nuxt.local';

/**
 * The core client's options for one request:
 *   - with `baseUrl`, calls go there;
 *   - with an `event`, during SSR, they go through `event.fetch`, in process,
 *     carrying the incoming cookies and headers;
 *   - otherwise, in the browser, they go to the page's origin, under `prefix`.
 */
export function apiHttpOptions(target: ApiTarget): HttpClientOptions {
	if (target.baseUrl !== undefined) return { baseUrl: target.baseUrl };
	const { prefix } = target;
	const local = target.event?.fetch;
	if (local) {
		return {
			baseUrl: LOCAL + prefix,
			fetch: (request) => {
				const url = new URL(request.url);
				return local(url.pathname + url.search, {
					method: request.method,
					// h3 spreads these into a plain object: a `Headers` would be lost.
					headers: Object.fromEntries(request.headers),
					body: request.body,
					signal: request.signal,
					// A streamed body requires it, on Node.
					duplex: 'half',
				} as RequestInit);
			},
		};
	}
	const origin = target.origin ?? globalThis.location?.origin;
	if (origin === undefined) {
		throw new Error(
			'@nxgt/openapi-nuxt: no request event and no page origin to send the call to',
		);
	}
	return { baseUrl: new URL(prefix, origin).href };
}

/**
 * A value as the SSR payload carries it: a reply without its `Response`,
 * which the payload cannot serialize, and anything else as it is.
 */
export type Payload<T> = T extends { readonly response: Response }
	? Omit<T, 'response'>
	: T;

/** `value` as `Payload<T>` types it: a reply's `response` taken off. */
export function toPayload<T>(value: T): Payload<T> {
	if (
		typeof value === 'object' &&
		value !== null &&
		(value as { response?: unknown }).response instanceof Response
	) {
		const { response: _response, ...rest } = value as Record<string, unknown>;
		return rest as Payload<T>;
	}
	return value as Payload<T>;
}

/**
 * `useApiData`'s arguments, the key first: the one the call gives, or else
 * the one Nuxt's compiler appended last, as it does for `useAsyncData`.
 */
export function keyedArgs(
	args: readonly unknown[],
): [key: string, handler: unknown, options: unknown] {
	const rest = [...args];
	const appended =
		rest.length > 1 && typeof rest[rest.length - 1] === 'string'
			? (rest.pop() as string)
			: undefined;
	const key = typeof rest[0] === 'string' ? (rest.shift() as string) : appended;
	if (key === undefined || typeof rest[0] !== 'function') {
		throw new TypeError(
			'@nxgt/openapi-nuxt: useApiData takes a key, or none, then a handler',
		);
	}
	return [key, rest[0], rest[1]];
}
