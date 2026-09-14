/**
 * `createQueries`: TanStack Query options for the calls of a client of
 * `createHttpClient`. It adds no runtime of TanStack's: each function returns
 * a plain object, whose `queryFn` sends the call with the query's `signal`.
 */
import { type HttpClient, type Method, ok } from '@nxgt/httpyz';
import type { HttpQueries, KeyInput, Paging, QueriesOptions } from './types';

type Send = (
	method: Method,
	path: string,
	options: object,
) => Promise<{ readonly status: number; readonly data: unknown }>;

type Options = KeyInput & {
	readonly signal?: AbortSignal | null;
	readonly decode?: boolean;
};

/** Both signals: the call ends on either. */
const joined = (
	given: AbortSignal | null | undefined,
	query: AbortSignal,
): AbortSignal => (given ? AbortSignal.any([given, query]) : query);

/** A value TanStack hashes as it is: a `URLSearchParams` or `FormData` as its entries. */
const hashable = (value: unknown): unknown =>
	value instanceof URLSearchParams ||
	(typeof FormData !== 'undefined' && value instanceof FormData)
		? [...value.entries()]
		: value;

/** What tells two calls to one path apart: what they send, and `decode: false`. */
function keyed(input: Options | undefined): object | undefined {
	if (!input) return undefined;
	const key: Record<string, unknown> = {};
	for (const part of [
		'param',
		'query',
		'json',
		'form',
		'text',
		'body',
	] as const) {
		if (input[part] !== undefined) key[part] = hashable(input[part]);
	}
	if (input.decode === false) key.decode = false;
	return Object.keys(key).length > 0 ? key : undefined;
}

/** `options` with `pageParam` as its query parameter `name`: left out when `null`. */
function paged(options: Options, name: string, pageParam: unknown): Options {
	const given = options.query;
	if (given instanceof URLSearchParams) {
		const query = new URLSearchParams(given);
		if (pageParam === null || pageParam === undefined) query.delete(name);
		else query.set(name, String(pageParam));
		return { ...options, query };
	}
	return {
		...options,
		query: { ...given, [name]: pageParam as string | null | undefined },
	};
}

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
	const queryKey = (method: Method, path?: string, input?: KeyInput) => {
		const key: unknown[] = scope === undefined ? [method] : [scope, method];
		if (path !== undefined) key.push(path);
		const rest = keyed(input);
		if (rest !== undefined) key.push(rest);
		return key;
	};
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
