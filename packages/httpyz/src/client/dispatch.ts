/**
 * The last leg of every call: a built `Request` through the middleware to
 * `fetch`, under its deadline.
 */
import { type CallContext, NetworkError, TimeoutError } from '../errors/errors';
import { compose, type Middleware, type Next } from '../middleware/compose';
import {
	type RetryOptions,
	retrying,
	retrySettings,
} from '../middleware/retry';
import type { ClientState } from './state';

/** How one request is sent, beside the request itself. */
export interface Dispatch {
	readonly context: CallContext;
	readonly timeout: number | undefined;
	readonly deadline: AbortSignal | undefined;
	readonly retry: number | RetryOptions | false | undefined;
	/** What `use()` added, inside the client's own middleware. */
	readonly added: readonly Middleware[];
}

/** The request's own signal, with `timeout`'s deadline added. */
export const withDeadline = (
	timeout: number | undefined,
	signal: AbortSignal | null | undefined,
) => {
	const deadline =
		timeout === undefined ? undefined : AbortSignal.timeout(timeout);
	const signals = [signal, deadline].filter(
		(each): each is AbortSignal => each != null,
	);
	return {
		deadline,
		signal: signals.length > 1 ? AbortSignal.any(signals) : signals[0],
	};
};

/**
 * Through `retry`, `auth`, `use` and then `added`, what `use()` added, to
 * `fetch`: fetch's failure and the deadline made errors.
 */
export const dispatch = async (
	{ options, signer }: ClientState,
	request: Request,
	{ context, timeout, deadline, retry, added }: Dispatch,
): Promise<Response> => {
	const fetch = options.fetch ?? ((sent: Request) => globalThis.fetch(sent));
	// fetch's own failure is a NetworkError, which `retry` retries; an abort is not one.
	const send: Next = async (sent) => {
		try {
			// As fetch does: a signal aborted before the call never sends.
			sent.signal.throwIfAborted();
			return await fetch(sent);
		} catch (error) {
			if (request.signal.aborted) throw error;
			throw new NetworkError(context, { cause: error });
		}
	};
	const again = retrySettings(retry);
	const layers = [
		...(again ? [retrying(again)] : []),
		...(signer ? [signer] : []),
		...(options.use ?? []),
		...added,
	];
	try {
		return await compose(layers, send, context)(request);
	} catch (error) {
		if (deadline?.aborted && timeout !== undefined) {
			throw new TimeoutError(context, timeout, { cause: error });
		}
		throw error;
	}
};
