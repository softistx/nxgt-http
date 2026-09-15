/**
 * The options objects `createQueries()` returns. They are plain objects, so
 * any TanStack Query adapter takes them: `useQuery(queries.queryOptions(...))`
 * in React, `createQuery` in Solid, `injectQuery` in Angular.
 */
import type {
	CallOptions,
	HttpReply,
	Method,
	PathParamNames,
	QueryInput,
	ReplyOptions,
	RequestArgs,
	RequestInput,
	RequestOptions,
	Responses,
	Success,
} from '@nxgt/httpyz';
import type {
	DataTag,
	GetNextPageParamFunction,
	GetPreviousPageParamFunction,
	InfiniteData,
} from '@tanstack/query-core';

/** What a query resolves to: the data of the call's 2xx replies. */
export type QueryData<
	R extends Responses | undefined,
	Decoded extends boolean,
> = Success<HttpReply<R, Decoded>>['data'];

/**
 * A key: `[method, path, input]`, after the client's `scope`, tagged with its
 * data so that `queryClient.getQueryData(key)` is typed.
 */
export type HttpQueryKey<Data> = DataTag<readonly unknown[], Data>;

export interface HttpQueryOptions<Data> {
	readonly queryKey: HttpQueryKey<Data>;
	/** Sends the call with the query's `signal`: a cancelled query aborts it. */
	readonly queryFn: (context: {
		readonly signal: AbortSignal;
	}) => Promise<Data>;
}

/** How an infinite query pages: TanStack's own options, and where the page goes. */
export interface Paging<Data, PageParam> {
	/**
	 * The query parameter each page's `pageParam` is sent as: `'after'`,
	 * `'page'`. A `null` or `undefined` page param is left out.
	 */
	readonly pageParamName: string;
	readonly initialPageParam: PageParam;
	readonly getNextPageParam: GetNextPageParamFunction<PageParam, Data>;
	readonly getPreviousPageParam?: GetPreviousPageParamFunction<PageParam, Data>;
	readonly maxPages?: number;
}

export interface HttpInfiniteQueryOptions<Data, PageParam>
	extends Omit<Paging<Data, PageParam>, 'pageParamName'> {
	readonly queryKey: HttpQueryKey<InfiniteData<Data, PageParam>>;
	readonly queryFn: (context: {
		readonly signal: AbortSignal;
		readonly pageParam: PageParam;
	}) => Promise<Data>;
}

/** What a mutation's `mutate()` takes: what the call sends, and its call options. */
export type MutationVariables<Path extends string> = RequestInput<Path> &
	CallOptions;

export interface HttpMutationOptions<Path extends string, Data> {
	readonly mutationKey: readonly unknown[];
	/** Optional when the path has no `{name}`s: `mutate()`. */
	readonly mutationFn: (
		variables: [PathParamNames<Path>] extends [never]
			? // biome-ignore lint/suspicious/noConfusingVoidType: void, not undefined, is what lets `mutate()` be called with nothing
				MutationVariables<Path> | void
			: MutationVariables<Path>,
	) => Promise<Data>;
}

/** What a key may hold, for a filter: any part of an input. */
export interface KeyInput {
	readonly param?: { readonly [name: string]: unknown };
	readonly query?: QueryInput;
	readonly header?: { readonly [name: string]: unknown };
	readonly json?: unknown;
	readonly form?: unknown;
	readonly text?: string;
	readonly body?: unknown;
	/** `false` for the calls that do not decode, which their keys hold. */
	readonly decode?: false;
}

export interface HttpQueries {
	/**
	 * A query of a call: `useQuery(queries.queryOptions('get', '/items/{id}', { param: { id }, responses }))`.
	 * It resolves to the data of a 2xx reply, and throws a `ReplyStatusError`
	 * for any other.
	 */
	queryOptions<
		Path extends string,
		R extends Responses | undefined = undefined,
		Decoded extends boolean = true,
	>(
		method: Method,
		path: Path,
		...args: RequestArgs<Path, R, Decoded>
	): HttpQueryOptions<QueryData<R, Decoded>>;
	/** An infinite query of a call: each page sent with its `pageParam` as a query parameter. */
	infiniteQueryOptions<
		Path extends string,
		PageParam,
		R extends Responses | undefined = undefined,
		Decoded extends boolean = true,
	>(
		method: Method,
		path: Path,
		options: RequestOptions<Path, R, Decoded>,
		paging: Paging<QueryData<R, Decoded>, PageParam>,
	): HttpInfiniteQueryOptions<QueryData<R, Decoded>, PageParam>;
	/**
	 * A mutation of a call, whose `mutate()` takes what it sends:
	 * `useMutation(queries.mutationOptions('delete', '/items/{id}'))`, then
	 * `mutate({ param: { id } })`. `options` holds what every call shares.
	 */
	mutationOptions<
		Path extends string,
		R extends Responses | undefined = undefined,
		Decoded extends boolean = true,
	>(
		method: Method,
		path: Path,
		options?: CallOptions & ReplyOptions<R, Decoded>,
	): HttpMutationOptions<Path, QueryData<R, Decoded>>;
	/**
	 * A key, or the start of one, for a filter:
	 * `queryClient.invalidateQueries({ queryKey: queries.queryKey('get', '/items') })`
	 * matches every query of `GET /items`, whatever its input.
	 */
	queryKey(method: Method, path?: string, input?: KeyInput): readonly unknown[];
}

export interface QueriesOptions {
	/**
	 * Put first in every key, to keep two clients' queries apart when their
	 * paths are the same: `'catalog'`.
	 */
	readonly scope?: string;
}
