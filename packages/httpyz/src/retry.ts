/**
 * A request sent again after a failure that may pass: no reply at all, or a
 * 408, 429, 502, 503 or 504. Only for methods that may be repeated, since a
 * POST that got no reply may still have been carried out.
 */
import { NetworkError } from './errors';
import type { Middleware } from './middleware';
import type { Method } from './types';

export interface RetryOptions {
	/** Tries after the first. Default: 2. */
	attempts?: number;
	/** Default: those that may be repeated: every method but POST and PATCH. */
	methods?: readonly Method[];
	/** Default: 408, 429, 502, 503, 504. */
	statuses?: readonly number[];
	/**
	 * Milliseconds before retry `attempt`, from 1. Default: a random wait up to
	 * 300 ms, doubled at each retry. A reply's `Retry-After` wins over it.
	 */
	delay?: (attempt: number) => number;
	/**
	 * The longest wait. A reply whose `Retry-After` asks for longer is the
	 * reply. Default: 10 000.
	 */
	maxDelay?: number;
}

export type RetrySettings = Required<RetryOptions>;

const REPEATABLE: readonly Method[] = [
	'get',
	'head',
	'options',
	'put',
	'delete',
	'trace',
	'query',
];
const TRANSIENT: readonly number[] = [408, 429, 502, 503, 504];

/** Full jitter: a random wait up to 300 ms × 2^(attempt − 1). */
const backoff = (attempt: number): number =>
	Math.random() * 300 * 2 ** (attempt - 1);

/** `retry` as the client or a call gives it; `undefined` never retries. */
export function retrySettings(
	retry: number | RetryOptions | false | undefined,
): RetrySettings | undefined {
	if (retry === undefined || retry === false) return undefined;
	const options = typeof retry === 'number' ? { attempts: retry } : retry;
	const attempts = options.attempts ?? 2;
	if (attempts <= 0) return undefined;
	return {
		attempts,
		methods: options.methods ?? REPEATABLE,
		statuses: options.statuses ?? TRANSIENT,
		delay: options.delay ?? backoff,
		maxDelay: options.maxDelay ?? 10_000,
	};
}

/**
 * Milliseconds before retry `attempt`: the reply's `Retry-After`, in seconds
 * or as a date, else `delay`. `undefined` when `Retry-After` is past
 * `maxDelay`.
 */
export function retryDelay(
	response: Response | undefined,
	attempt: number,
	settings: RetrySettings,
): number | undefined {
	const header = response?.headers.get('retry-after')?.trim();
	if (header) {
		const wait = /^\d+(?:\.\d+)?$/.test(header)
			? Number(header) * 1000
			: Date.parse(header) - Date.now();
		if (!Number.isNaN(wait)) {
			return wait > settings.maxDelay ? undefined : Math.max(0, wait);
		}
	}
	return Math.min(Math.max(0, settings.delay(attempt)), settings.maxDelay);
}

/** Waits `ms`, or rejects with the signal's reason once it aborts. */
const sleep = (ms: number, signal: AbortSignal): Promise<void> =>
	new Promise((resolve, reject) => {
		if (signal.aborted) return reject(signal.reason);
		const stop = () => {
			clearTimeout(timer);
			reject(signal.reason);
		};
		const timer = setTimeout(() => {
			signal.removeEventListener('abort', stop);
			resolve();
		}, ms);
		signal.addEventListener('abort', stop, { once: true });
	});

export function retrying(settings: RetrySettings): Middleware {
	return async (request, next) => {
		const method = request.method.toLowerCase() as Method;
		if (!settings.methods.includes(method)) return next(request);
		for (let attempt = 1; ; attempt++) {
			const last = attempt > settings.attempts;
			// Each try sends a copy; the last sends the request itself.
			const sent = last ? request : request.clone();
			let wait: number | undefined;
			try {
				const response = await next(sent);
				if (last || !settings.statuses.includes(response.status)) {
					return response;
				}
				wait = retryDelay(response, attempt, settings);
				if (wait === undefined) return response;
				await response.body?.cancel();
			} catch (error) {
				if (last || !(error instanceof NetworkError)) throw error;
				wait = retryDelay(undefined, attempt, settings) ?? 0;
			}
			await sleep(wait, request.signal);
		}
	};
}
