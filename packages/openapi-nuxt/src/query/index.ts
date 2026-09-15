/**
 * `@nxgt/openapi-nuxt/query`: TanStack Query for the bound client, through
 * `@tanstack/vue-query` and `@nxgt/httpyz-query`. With `query` set, the module
 * writes `useApiQueries`, `useApiQuery` and `useApiMutation` into the app
 * from `apiQueryComposables`, and installs Vue Query with what is re-exported
 * here, so the app and this module share one copy of it.
 */
import {
	createOpenApiQueries,
	type MutationInit,
	type OpenApiQueries,
	type OperationData,
	type OperationVariables,
} from '@nxgt/httpyz-query/openapi';
import type {
	IdOf,
	MethodsOf,
	OpenApiClient,
	OperationInit,
	OperationsShape,
	PathsOf,
} from '@nxgt/openapi-httpyz';
import {
	type DefaultError,
	type MutationOptions,
	type UseMutationReturnType,
	type UseQueryOptions,
	type UseQueryReturnType,
	useMutation,
	useQuery,
} from '@tanstack/vue-query';
import { type MaybeRefOrGetter, toValue } from 'vue';
import { type MaybeRefDeep, queryArgs, unrefDeep } from './args';

export {
	type DehydratedState,
	dehydrate,
	hydrate,
	QueryClient,
	VueQueryPlugin,
} from '@tanstack/vue-query';
export type { MaybeRefDeep } from './args';

/** vue-query's options of a query, its key and its function aside: `useApiQuery` writes those. */
export type ApiQueryOptions<Data> = Omit<
	Exclude<
		UseQueryOptions<Data, DefaultError, Data, Data>,
		{ readonly value: unknown }
	>,
	'queryKey' | 'queryFn'
> & {
	/** What the call is sent with, beside the query's signal: headers, `latest`… */
	readonly init?: MaybeRefOrGetter<OperationInit | undefined>;
};

/** The input an operation takes, each field a ref or a value, then the query's options. */
export type ApiQueryArgs<Input extends readonly unknown[], Data> = [
	...{ [K in keyof Input]: MaybeRefDeep<Input[K]> },
	options?: ApiQueryOptions<Data>,
];

/** vue-query's options of a mutation, its key and its function aside, and what each call is sent with. */
export type ApiMutationOptions<Variables, Data> = Omit<
	MutationOptions<Data, DefaultError, Variables, unknown>,
	'mutationKey' | 'mutationFn'
> & {
	/** What every call is sent with, or a function of `mutate()`'s input that returns each call's. */
	readonly init?: MutationInit<Variables>;
};

type Id<Ops, Routes, M extends string, P extends string> = IdOf<
	Ops,
	Routes,
	M & MethodsOf<Routes>,
	P
>;

/** What the module auto-imports, bound to the app's client. */
export interface ApiQueryComposables<
	Ops extends OperationsShape<Ops>,
	Routes,
	Decoded extends boolean,
> {
	/** The query options of every operation: `useQuery(queries.queryOptions('get', path, input))`. */
	useApiQueries(): OpenApiQueries<Ops, Routes, Decoded>;
	/**
	 * `useQuery` of the operation at a path. The input may hold refs, and the
	 * query follows them; `await suspense()` fetches it during SSR.
	 */
	useApiQuery<M extends MethodsOf<Routes>, P extends PathsOf<Routes, M>>(
		method: M,
		path: P,
		...args: ApiQueryArgs<
			Ops[Id<Ops, Routes, M, P>]['args'],
			OperationData<Ops, Id<Ops, Routes, M, P>, Decoded>
		>
	): UseQueryReturnType<
		OperationData<Ops, Id<Ops, Routes, M, P>, Decoded>,
		DefaultError
	>;
	/** `useMutation` of the operation at a path, whose `mutate()` takes its input. */
	useApiMutation<M extends MethodsOf<Routes>, P extends PathsOf<Routes, M>>(
		method: M,
		path: P,
		options?: ApiMutationOptions<
			OperationVariables<Ops[Id<Ops, Routes, M, P>]['args']>,
			OperationData<Ops, Id<Ops, Routes, M, P>, Decoded>
		>,
	): UseMutationReturnType<
		OperationData<Ops, Id<Ops, Routes, M, P>, Decoded>,
		DefaultError,
		OperationVariables<Ops[Id<Ops, Routes, M, P>]['args']>,
		unknown
	>;
}

/** The queries as this file calls them, their types aside. */
interface Untyped {
	queryOptions(
		method: string,
		path: string,
		...args: unknown[]
	): {
		queryKey: readonly unknown[];
		queryFn: (context: { signal: AbortSignal }) => Promise<unknown>;
	};
	mutationOptions(
		method: string,
		path: string,
		init?: unknown,
	): {
		mutationKey: readonly unknown[];
		mutationFn: (variables: unknown) => Promise<unknown>;
	};
}

/** `useApiQueries`, `useApiQuery` and `useApiMutation` over the client `useApi()` returns. */
export function apiQueryComposables<
	Ops extends OperationsShape<Ops>,
	Routes,
	Decoded extends boolean,
>(
	useApi: () => OpenApiClient<Ops, Routes, Decoded>,
): ApiQueryComposables<Ops, Routes, Decoded> {
	const useApiQueries = () => createOpenApiQueries(useApi());
	const untyped = () => useApiQueries() as unknown as Untyped;
	return {
		useApiQueries,
		useApiQuery(method: string, path: string, ...args: unknown[]) {
			const queries = untyped();
			const { takes, input, options } = queryArgs(
				useApi().operations,
				method,
				path,
				args,
			);
			const { init, ...rest } = (options ?? {}) as ApiQueryOptions<unknown>;
			// A getter: vue-query reads it again, with the refs it reads, when one changes.
			return useQuery(() => ({
				...rest,
				...(takes
					? queries.queryOptions(method, path, unrefDeep(input), toValue(init))
					: queries.queryOptions(method, path, toValue(init))),
			}));
		},
		useApiMutation(
			method: string,
			path: string,
			options: ApiMutationOptions<unknown, unknown> = {},
		) {
			const { init, ...rest } = options;
			return useMutation({
				...rest,
				...untyped().mutationOptions(method, path, init),
			});
		},
	} as unknown as ApiQueryComposables<Ops, Routes, Decoded>;
}
