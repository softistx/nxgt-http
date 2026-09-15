/** The options `createOpenApiQueries()` returns, typed by the generated spec. */
import type { Method, Success } from '@nxgt/httpyz';
import type {
	Args,
	IdOf,
	MethodsOf,
	OperationInit,
	OperationReply,
	OperationsShape,
	PathsOf,
} from '@nxgt/openapi-httpyz';
import type {
	HttpInfiniteQueryOptions,
	HttpQueryOptions,
	KeyInput,
	Paging,
} from '../queries/types';

/** Each reply's `data`. */
type DataOf<Reply> = Reply extends { readonly data: infer Data } ? Data : never;

/** What a query of an operation resolves to: the data of its 2xx replies. */
export type OperationData<
	Ops extends OperationsShape<Ops>,
	K extends keyof Ops,
	Decoded extends boolean,
> = DataOf<Success<OperationReply<Ops, K, Decoded>>>;

/** An operation's input: `void` when it takes none, and may be left out when nothing in it is required. */
export type OperationVariables<Args> = Args extends readonly []
	? // biome-ignore lint/suspicious/noConfusingVoidType: void, not undefined, is what lets `mutate()` be called with nothing
		void
	: Args extends readonly [infer Input]
		? Input
		: Args extends readonly [(infer Input)?]
			? // biome-ignore lint/suspicious/noConfusingVoidType: void, not undefined, is what lets `mutate()` be called with nothing
				Input | void
			: never;

/** The query parameters of an operation's input. */
export type QueryNames<Input> = Input extends { readonly query?: infer Query }
	? keyof NonNullable<Query> & string
	: never;

/**
 * What every call of a mutation is sent with, or a function of `mutate()`'s
 * input that returns each call's: its own `signal`, `latest` or headers.
 */
export type MutationInit<Variables> =
	| OperationInit
	| ((variables: Variables) => OperationInit | undefined);

export interface OpenApiMutationOptions<Variables, Data> {
	readonly mutationKey: readonly unknown[];
	readonly mutationFn: (variables: Variables) => Promise<Data>;
}

export type OpenApiQueries<
	Ops extends OperationsShape<Ops>,
	Routes,
	Decoded extends boolean,
> = {
	/**
	 * A query of the operation at a path, taking what `api.get(path, ...)`
	 * takes. It resolves to the data of a 2xx reply, and throws a
	 * `ReplyStatusError` for any other.
	 */
	queryOptions<M extends MethodsOf<Routes>, P extends PathsOf<Routes, M>>(
		method: M,
		path: P,
		...args: Args<Ops, IdOf<Ops, Routes, M, P>>
	): HttpQueryOptions<OperationData<Ops, IdOf<Ops, Routes, M, P>, Decoded>>;
	/** An infinite query of an operation: each page sent with its `pageParam` as one of its query parameters. */
	infiniteQueryOptions<
		M extends MethodsOf<Routes>,
		P extends PathsOf<Routes, M>,
		PageParam,
	>(
		method: M,
		path: P,
		input: Ops[IdOf<Ops, Routes, M, P>]['args'][0],
		paging: Omit<
			Paging<OperationData<Ops, IdOf<Ops, Routes, M, P>, Decoded>, PageParam>,
			'pageParamName'
		> & {
			readonly pageParamName: QueryNames<
				Ops[IdOf<Ops, Routes, M, P>]['args'][0]
			>;
		},
		init?: OperationInit,
	): HttpInfiniteQueryOptions<
		OperationData<Ops, IdOf<Ops, Routes, M, P>, Decoded>,
		PageParam
	>;
	/**
	 * A mutation of the operation at a path, whose `mutate()` takes its input.
	 * `init` holds what every call shares, or is a function of the input that
	 * returns each call's own.
	 */
	mutationOptions<M extends MethodsOf<Routes>, P extends PathsOf<Routes, M>>(
		method: M,
		path: P,
		init?: MutationInit<
			OperationVariables<Ops[IdOf<Ops, Routes, M, P>]['args']>
		>,
	): OpenApiMutationOptions<
		OperationVariables<Ops[IdOf<Ops, Routes, M, P>]['args']>,
		OperationData<Ops, IdOf<Ops, Routes, M, P>, Decoded>
	>;
	/** A key, or the start of one, for a filter: `queries.queryKey('get', '/items')`. */
	queryKey(method: Method, path?: string, input?: KeyInput): readonly unknown[];
};
