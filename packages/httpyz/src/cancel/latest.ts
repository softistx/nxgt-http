/**
 * `latest`: one call running per key. A call with a key aborts the one before
 * it with the same key, if that one still runs: a search typed ahead keeps
 * only its last query in flight.
 */
import { cancelled } from './abort';

/** A client's keys: `claim(key)` aborts the key's previous call, and returns the new call's signal. */
export function createLatest(): (key: string) => AbortSignal {
	// A finished call's controller stays until its key is used again: aborting it then does nothing.
	const running = new Map<string, AbortController>();
	return (key) => {
		running
			.get(key)
			?.abort(
				cancelled(`A later call with latest: '${key}' replaced this one`),
			);
		const controller = new AbortController();
		running.set(key, controller);
		return controller.signal;
	};
}
