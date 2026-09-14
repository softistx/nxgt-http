/**
 * Aborts, as the client makes and recognizes them. A call aborted through its
 * `signal`, by a later call with the same `latest`, or by its group's
 * `cancel()` rejects with the abort's reason, unwrapped: an `AbortError`
 * unless the caller gave a reason of its own.
 */

/**
 * Whether `error` ended a call because it was aborted, rather than failed:
 * a signal aborted without a reason of its own, or by `AbortSignal.timeout()`,
 * a later call with the same `latest`, or a group's `cancel()`. The client's
 * own `TimeoutError`, past `timeout`, is a failure, not an abort.
 */
export function isAbortError(error: unknown): boolean {
	if (typeof DOMException !== 'undefined' && error instanceof DOMException) {
		return error.name === 'AbortError' || error.name === 'TimeoutError';
	}
	return error instanceof Error && error.name === 'AbortError';
}

/** What the client aborts a call with: an `AbortError`, which `isAbortError` knows. */
export const cancelled = (message: string): DOMException =>
	new DOMException(message, 'AbortError');

/** `promise`, or the signal's reason as soon as it aborts; the promise itself runs on. */
export function abortable<T>(
	promise: Promise<T>,
	signal: AbortSignal | undefined,
): Promise<T> {
	if (!signal) return promise;
	if (signal.aborted) return Promise.reject(signal.reason);
	return new Promise<T>((resolve, reject) => {
		const stop = () => reject(signal.reason);
		signal.addEventListener('abort', stop, { once: true });
		promise
			.then(resolve, reject)
			.finally(() => signal.removeEventListener('abort', stop));
	});
}

/** One signal that aborts with the first of them; `undefined` when there are none. */
export function joinSignals(
	...signals: (AbortSignal | null | undefined)[]
): AbortSignal | undefined {
	const present = signals.filter(
		(signal): signal is AbortSignal => signal != null,
	);
	return present.length > 1 ? AbortSignal.any(present) : present[0];
}
