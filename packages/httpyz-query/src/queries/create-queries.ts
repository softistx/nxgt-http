/**
 * `createQueries`: TanStack Query options for the calls of a client of
 * `createHttpClient`. It adds no runtime of TanStack's: each function returns
 * a plain object, whose `queryFn` sends the call with the query's `signal`.
 */
import { type HttpClient, type Method, ok } from '@nxgt/httpyz';
import { joined, keyOf, paged } from '../key/key';
import type { HttpQueries, KeyInput, Paging, QueriesOptions } from './types';

type Send = (
	method: Method,
	path: string,
	options: object,
) => Promise<{ readonly status: number; readonly data: unknown }>;

type Options = KeyInput & { readonly signal?: AbortSignal | null };

/**
 * TanStack Query options for the calls of `http`.
 *
 * ```ts
 * const queries = createQueries(http);
 * const { data } = useQuery(
 *   queries.queryOptions('get', '/items/{id}', { param: { id }, responses: { 200: Item } }),
 * );
 * ```
 */
export function createQueries(
	http: HttpClient,
	{ scope }: QueriesOptions = {},
): HttpQueries {
	const send = http.request as unknown as Send;
	const queryKey = (method: Method, path?: string, input?: KeyInput) =>
		keyOf(scope, method, path, input);
	const call = (
		method: Method,
		path: string,
		options: Options | undefined,
		signal: AbortSignal,
	) =>
		send(method, path, {
			...options,
			signal: joined(options?.signal, signal),
		}).then(ok);

	return {
		queryKey,
		queryOptions: (method: Method, path: string, options?: Options) => ({
			queryKey: queryKey(method, path, options),
			queryFn: ({ signal }: { signal: AbortSignal }) =>
				call(method, path, options, signal),
		}),
		infiniteQueryOptions: (
			method: Method,
			path: string,
			options: Options,
			{ pageParamName, ...paging }: Paging<unknown, unknown>,
		) => ({
			...paging,
			// Apart from the query of the same call, whose data is one page, not all of them.
			queryKey: [...queryKey(method, path, options), 'infinite'],
			queryFn: ({
				signal,
				pageParam,
			}: {
				signal: AbortSignal;
				pageParam: unknown;
			}) =>
				call(method, path, paged(options, pageParamName, pageParam), signal),
		}),
		mutationOptions: (method: Method, path: string, options?: object) => ({
			mutationKey: queryKey(method, path),
			mutationFn: (variables: object | undefined) =>
				send(method, path, { ...options, ...(variables || {}) }).then(ok),
		}),
	} as unknown as HttpQueries;
}
