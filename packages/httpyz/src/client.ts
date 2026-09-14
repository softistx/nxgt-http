/**
 * `createClient`: calls the operations of the generated `operations` table
 * with the standard `fetch`, typed by the generated `ClientOperations`.
 */
import { encodeRequest, type Input } from './encode';
import { NetworkError, TimeoutError, ValidationError } from './errors';
import { readReply } from './reply';
import type {
	CallInit,
	Client,
	ClientArgs,
	ClientOptions,
	Method,
	OperationsShape,
	OperationTable,
	RuntimeOperation,
} from './types';
import { checkRequest } from './validate';

const METHODS: readonly Method[] = [
	'get',
	'put',
	'post',
	'delete',
	'options',
	'head',
	'patch',
	'trace',
	'query',
];

/**
 * A client for a spec: `ClientOperations` and `OperationsByRoute` from the
 * generated `types.ts`, and the `operations` table of `operations.ts`.
 *
 * ```ts
 * const api = createClient<ClientOperations, OperationsByRoute>(operations, {
 * 	baseUrl: 'https://api.example.com',
 * });
 * const reply = await api.get('/employees/{id}', { param: { id } });
 * if (reply.status === 200) reply.data.name;
 * ```
 */
export function createClient<
	Ops extends OperationsShape<Ops>,
	Routes extends { [Route in keyof Routes]: keyof Ops } = Record<never, never>,
	Decoded extends boolean = false,
>(
	operations: OperationTable<Ops>,
	...[given]: ClientArgs<Decoded>
): Client<Ops, Routes, Decoded> {
	const options: ClientOptions & { readonly decode?: boolean } = given ?? {};
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
	for (const [id, operation] of Object.entries(table)) {
		byRoute.set(`${operation.method} ${operation.path}`, id);
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
		const init = ((takes ? args[1] : args[0]) ?? {}) as CallInit;
		const {
			timeout = options.timeout,
			headers: own,
			signal: abort,
			...rest
		} = init;
		const shared =
			typeof options.headers === 'function'
				? await options.headers()
				: options.headers;
		const headers = new Headers(shared);
		new Headers(own).forEach((value, name) => {
			headers.set(name, value);
		});
		const { url, body } = encodeRequest(
			operation,
			input,
			headers,
			options.baseUrl,
		);
		const context = {
			operationId: id,
			method: operation.method,
			path: operation.path,
		};
		if (checks.request) {
			const issues = await checkRequest(operation, input);
			if (issues.length > 0) {
				throw new ValidationError(context, {
					kind: 'request',
					...context,
					issues,
				});
			}
		}
		const deadline =
			timeout === undefined ? undefined : AbortSignal.timeout(timeout);
		const signals = [abort, deadline].filter(
			(signal): signal is AbortSignal => signal != null,
		);
		const request = new Request(url, {
			...options.init,
			...rest,
			method: operation.method.toUpperCase(),
			headers,
			body,
			signal: signals.length > 1 ? AbortSignal.any(signals) : signals[0],
		});
		const send = options.fetch ?? ((sent: Request) => globalThis.fetch(sent));
		let response: Response;
		try {
			response = await send(request);
		} catch (error) {
			if (deadline?.aborted && timeout !== undefined) {
				throw new TimeoutError(context, timeout, { cause: error });
			}
			if (abort?.aborted) throw error;
			throw new NetworkError(context, { cause: error });
		}
		return readReply(context, operation, response, {
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
	return client as unknown as Client<Ops, Routes, Decoded>;
}
