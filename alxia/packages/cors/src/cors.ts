import { type Plugin, vary, withHeaders } from '@alxia/core';

/** Which origins may call: every one, a list, a pattern, or a decision per origin. */
export type CorsOrigin =
	| true
	| string
	| readonly (string | RegExp)[]
	| RegExp
	| ((origin: string) => boolean);

export interface CorsOptions {
	/**
	 * The origins allowed. `true`, the default, allows every one: with
	 * `credentials`, the request's origin is echoed back, since `*` cannot
	 * carry them.
	 */
	readonly origin?: CorsOrigin;
	/** The methods a preflight allows. Every method but `CONNECT` and `TRACE` by default. */
	readonly methods?: readonly string[];
	/** The request headers a preflight allows. By default, those the browser asks for. */
	readonly allowedHeaders?: readonly string[];
	/** The response headers a script may read, beyond the safelisted ones. */
	readonly exposedHeaders?: readonly string[];
	/** Whether cookies and `Authorization` go with a cross-origin call. */
	readonly credentials?: boolean;
	/** How long, in seconds, a browser may keep a preflight's answer. */
	readonly maxAge?: number;
	/** Answers Chrome's Private Network Access preflight. */
	readonly privateNetwork?: boolean;
}

const METHODS = ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'];

/**
 * CORS, as a plugin: a preflight is answered before routing, with a 204,
 * and every response to an allowed origin carries its headers.
 *
 * ```ts
 * const app = alxia().use(cors({ origin: ['https://app.example.com'], credentials: true }));
 * ```
 */
export function cors(options: CorsOptions = {}): Plugin {
	const allows = matcher(options.origin ?? true);
	const methods = (options.methods ?? METHODS).join(', ');
	const exposed = options.exposedHeaders?.join(', ');

	/** The `Access-Control-Allow-Origin` an origin gets, or none. */
	const allowOrigin = (origin: string | null): string | undefined => {
		if (options.origin === undefined || options.origin === true) {
			if (!options.credentials) return '*';
			return origin ?? undefined;
		}
		return origin !== null && allows(origin) ? origin : undefined;
	};

	const common = (headers: Headers, origin: string | null) => {
		const allowed = allowOrigin(origin);
		if (allowed !== '*') vary(headers, 'Origin');
		if (allowed === undefined) return false;
		headers.set('access-control-allow-origin', allowed);
		if (options.credentials) {
			headers.set('access-control-allow-credentials', 'true');
		}
		return true;
	};

	return (app) =>
		app
			.onRequest(({ request }) => {
				const method = request.headers.get('access-control-request-method');
				if (request.method !== 'OPTIONS' || method === null) return;
				const headers = new Headers();
				if (common(headers, request.headers.get('origin'))) {
					headers.set('access-control-allow-methods', methods);
					const requested = request.headers.get(
						'access-control-request-headers',
					);
					const allowedHeaders =
						options.allowedHeaders?.join(', ') ?? requested;
					if (allowedHeaders) {
						headers.set('access-control-allow-headers', allowedHeaders);
					}
					if (options.allowedHeaders === undefined) {
						vary(headers, 'Access-Control-Request-Headers');
					}
					if (options.maxAge !== undefined) {
						headers.set('access-control-max-age', String(options.maxAge));
					}
					if (
						options.privateNetwork &&
						request.headers.get('access-control-request-private-network') ===
							'true'
					) {
						headers.set('access-control-allow-private-network', 'true');
					}
				}
				return new Response(null, { status: 204, headers });
			})
			.onResponse((response, { request }) => {
				if (
					request.method === 'OPTIONS' &&
					request.headers.has('access-control-request-method')
				) {
					return;
				}
				const origin = request.headers.get('origin');
				if (origin === null && allowOrigin(null) !== '*') return;
				return withHeaders(response, (headers) => {
					if (common(headers, origin) && exposed) {
						headers.set('access-control-expose-headers', exposed);
					}
				});
			});
}

function matcher(origin: CorsOrigin): (origin: string) => boolean {
	if (origin === true) return () => true;
	if (typeof origin === 'string') return (candidate) => candidate === origin;
	if (origin instanceof RegExp) return (candidate) => origin.test(candidate);
	if (typeof origin === 'function') return origin;
	return (candidate) =>
		origin.some((allowed) =>
			typeof allowed === 'string'
				? allowed === candidate
				: allowed.test(candidate),
		);
}
