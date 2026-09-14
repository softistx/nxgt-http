/**
 * `createOpenApiQueries`: TanStack Query options for the operations of a
 * client bound to a generated spec by `@nxgt/openapi-httpyz`. It imports that
 * package's types only: the calls are the bound client's own.
 */
import { type Method, ok } from '@nxgt/httpyz';
import type {
	OpenApiClient,
	OperationInit,
	OperationsShape,
	RuntimeOperation,
} from '@nxgt/openapi-httpyz';
import { joined, keyOf, paged } from '../key/key';
import type { KeyInput, Paging, QueriesOptions } from '../queries/types';
import type { OpenApiQueries } from './types';

type Call = (
	path: string,
	...args: unknown[]
) => Promise<{ readonly status: number; readonly data: unknown }>;

/**
 * TanStack Query options for the operations of `api`. The client's own
 * `operations` tell an operation's input from its init, as they do for its
 * calls: one that takes nothing is called with its init alone.
 *
 * ```ts
 * const queries = createOpenApiQueries(api);
 * const { data } = useQuery(queries.queryOptions('get', '/employees/{id}', { param: { id } }));
 * ```
 */
export function createOpenApiQueries<
	Ops extends OperationsShape<Ops>,
	Routes,
	Decoded extends boolean,
>(
	api: OpenApiClient<Ops, Routes, Decoded>,
	{ scope }: QueriesOptions = {},
): OpenApiQueries<Ops, Routes, Decoded> {
	// As the bound client reads its arguments: an operation that takes nothing has no input.
	const takes = new Map<string, boolean>();
	for (const operation of Object.values<RuntimeOperation>(
		api.operations as unknown as { readonly [id: string]: RuntimeOperation },
	)) {
		takes.set(
			`${operation.method} ${operation.path}`,
			operation.parameters.length > 0 ||
				Object.keys(operation.body?.content ?? {}).length > 0,
		);
	}
	const takesInput = (method: Method, path: string): boolean => {
		const found = takes.get(`${method} ${path}`);
		if (found === undefined) {
			throw new Error(
				`The spec has no ${method.toUpperCase()} ${path} operation`,
			);
		}
		return found;
	};
	/** The input and the init of a call's arguments. */
	const split = (method: Method, path: string, args: readonly unknown[]) =>
		takesInput(method, path)
			? { input: args[0] as object | undefined, init: args[1] as OperationInit }
			: { input: undefined, init: args[0] as OperationInit };
	const call = (
		method: Method,
		path: string,
		input: object | undefined,
		init: OperationInit | undefined,
		signal?: AbortSignal,
	) => {
		const sent = signal
			? { ...init, signal: joined(init?.signal, signal) }
			: init;
		const at = (api as unknown as Record<Method, Call>)[method];
		return (
			takesInput(method, path) ? at(path, input, sent) : at(path, sent)
		).then(ok);
	};
	const queryKey = (method: Method, path?: string, input?: KeyInput) =>
		keyOf(scope, method, path, input);

	return {
		queryKey,
		queryOptions: (method: Method, path: string, ...args: unknown[]) => {
			const { input, init } = split(method, path, args);
			return {
				queryKey: queryKey(method, path, input),
				queryFn: ({ signal }: { signal: AbortSignal }) =>
					call(method, path, input, init, signal),
			};
		},
		infiniteQueryOptions: (
			method: Method,
			path: string,
			input: object | undefined,
			{ pageParamName, ...paging }: Paging<unknown, unknown>,
			init?: OperationInit,
		) => ({
			...paging,
			// Apart from the query of the same call, whose data is one page, not all of them.
			queryKey: [...queryKey(method, path, input), 'infinite'],
			queryFn: ({
				signal,
				pageParam,
			}: {
				signal: AbortSignal;
				pageParam: unknown;
			}) =>
				call(
					method,
					path,
					paged(input, pageParamName, pageParam),
					init,
					signal,
				),
		}),
		mutationOptions: (method: Method, path: string, init?: OperationInit) => {
			takesInput(method, path);
			return {
				mutationKey: queryKey(method, path),
				mutationFn: (input: object | undefined) =>
					call(method, path, input || undefined, init),
			};
		},
	} as unknown as OpenApiQueries<Ops, Routes, Decoded>;
}
