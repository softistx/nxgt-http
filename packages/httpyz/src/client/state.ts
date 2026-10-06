/**
 * What a client's calls share, made once by `createHttpClient` and passed to
 * each part of a call explicitly: its options, its signer, and its `latest`
 * keys, which every group of the client claims from alike.
 */
import { createLatest } from '../cancel/latest';
import type { CallContext } from '../errors/errors';
import { auth } from '../middleware/auth';
import type { Middleware } from '../middleware/compose';
import type { HttpClientOptions } from './types';

export interface ClientState {
	readonly options: HttpClientOptions;
	readonly signer: Middleware | undefined;
	readonly claim: (key: string) => AbortSignal;
}

export const createState = (options: HttpClientOptions): ClientState => ({
	options,
	signer: options.auth ? auth(options.auth) : undefined,
	claim: createLatest(),
});

/**
 * A `latest` key's signal. Claimed before anything is awaited, so calls
 * with the same key replace each other in the order they were made.
 */
export const latestSignal = (state: ClientState, key: string | undefined) =>
	key === undefined ? undefined : state.claim(key);

/** The client's own headers, run again for each request. */
export const sharedHeaders = async ({
	options,
}: ClientState): Promise<Headers> =>
	new Headers(
		typeof options.headers === 'function'
			? await options.headers()
			: options.headers,
	);

export const contextOf = (
	method: string,
	path: string,
	operationId: string | undefined,
): CallContext =>
	operationId === undefined ? { method, path } : { method, path, operationId };
