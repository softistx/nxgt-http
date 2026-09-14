/**
 * `createOpenApiClient`: the operations `@nxgt/openapi-codegen` generates,
 * bound onto a client of `createHttpClient`. The client sends; the binding
 * adds what the spec knows: how each parameter and body is written, the
 * replies each operation declares, and checks by the server's own schemas.
 */
import { METHODS } from '../client/create-http-client';
import type { HttpClient } from '../client/types';
import { ValidationError } from '../errors/errors';
import type { Responses } from '../reply/types';
import { checkRequest } from './check-request';
import { type Input, toRequest } from './to-request';
import type {
	OpenApiArgs,
	OpenApiClient,
	OpenApiOptions,
	OperationInit,
	OperationsShape,
	OperationTable,
	RuntimeOperation,
} from './types';

/** An operation's replies as the core client declares them. */
const toResponses = (operation: RuntimeOperation): Responses =>
	Object.fromEntries(
		Object.entries(operation.responses).map(([status, content]) => [
			status,
			Object.keys(content).length === 0
				? null
				: Object.fromEntries(
						Object.entries(content).map(([type, media]) => [
							type,
							media.schema ?? null,
						]),
					),
		]),
	);

/**
 * A client for a spec: `ClientOperations` and `OperationsByRoute` from the
 * generated `types.ts`, and the `operations` table of `operations.ts`.
 *
 * ```ts
 * const http = createHttpClient({ baseUrl: 'https://api.example.com' });
 * const api = createOpenApiClient<ClientOperations, OperationsByRoute>(http, operations);
 * const reply = await api.get('/employees/{id}', { param: { id } });
 * if (reply.status === 200) reply.data.name;
 * ```
 */
export function createOpenApiClient<
	Ops extends OperationsShape<Ops>,
	Routes extends { [Route in keyof Routes]: keyof Ops } = Record<never, never>,
	Decoded extends boolean = false,
>(
	http: HttpClient,
	operations: OperationTable<Ops>,
	...[given]: OpenApiArgs<Decoded>
): OpenApiClient<Ops, Routes, Decoded> {
	const options: OpenApiOptions & { readonly decode?: boolean } = given ?? {};
	const { validate = false } = options;
	const decode = options.decode === true;
	const checks = {
		request:
			validate === true ||
			(typeof validate === 'object' && validate.request === true),
		response:
			decode ||
			validate === true ||
			(typeof validate === 'object' && validate.response === true),
	};
	const table = operations as unknown as {
		readonly [id: string]: RuntimeOperation;
	};
	const byRoute = new Map<string, string>();
	const responses = new Map<string, Responses>();
	for (const [id, operation] of Object.entries(table)) {
		byRoute.set(`${operation.method} ${operation.path}`, id);
		responses.set(id, toResponses(operation));
	}

	const call = async (
		id: string,
		args: readonly unknown[],
	): Promise<unknown> => {
		const operation = table[id];
		if (!operation) throw new Error(`${id} is not an operationId of the spec`);
		// An operation that takes nothing has no input: its first argument is the init.
		const takes =
			operation.parameters.length > 0 ||
			Object.keys(operation.body?.content ?? {}).length > 0;
		const input = (takes ? args[0] : undefined) as Input | undefined;
		const init = ((takes ? args[1] : args[0]) ?? {}) as OperationInit;
		if (checks.request) {
			const issues = await checkRequest(operation, input);
			if (issues.length > 0) {
				const context = {
					operationId: id,
					method: operation.method,
					path: operation.path,
				};
				throw new ValidationError(context, {
					kind: 'request',
					...context,
					issues,
				});
			}
		}
		const headers = new Headers(init.headers);
		const { query, body } = toRequest(operation, input, headers);
		const request = http.request as (
			method: string,
			path: string,
			options: object,
		) => Promise<unknown>;
		return request(operation.method, operation.path, {
			...init,
			...body,
			param: input?.param,
			query,
			headers,
			responses: responses.get(id),
			operationId: id,
			validate: checks.response,
			decode,
		});
	};

	const client: Record<string, unknown> = {
		op: (id: string, ...args: unknown[]) => call(id, args),
	};
	for (const method of METHODS) {
		client[method] = (path: string, ...args: unknown[]) => {
			const id = byRoute.get(`${method} ${path}`);
			if (id === undefined) {
				return Promise.reject(
					new Error(
						`The spec has no ${method.toUpperCase()} ${path} operation`,
					),
				);
			}
			return call(id, args);
		};
	}
	return client as unknown as OpenApiClient<Ops, Routes, Decoded>;
}
