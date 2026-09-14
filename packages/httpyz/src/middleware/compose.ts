/**
 * Middleware: a function around each request the client sends. It may change
 * the request, the response, or both, and calls `next` to go on; or answer
 * itself, and `fetch` is never called.
 *
 * ```ts
 * const timing: Middleware = async (request, next, call) => {
 * 	const start = performance.now();
 * 	try {
 * 		return await next(request);
 * 	} finally {
 * 		metrics.record(call.path, performance.now() - start);
 * 	}
 * };
 * ```
 */
import type { CallContext } from '../errors/errors';

export type Next = (request: Request) => Promise<Response>;

export type Middleware = (
	request: Request,
	next: Next,
	call: CallContext,
) => Promise<Response>;

/** `middlewares` around `send`, the first outermost. */
export const compose = (
	middlewares: readonly Middleware[],
	send: Next,
	call: CallContext,
): Next =>
	middlewares.reduceRight<Next>(
		(next, middleware) => (request) => middleware(request, next, call),
		send,
	);
