/**
 * `createOpenApiClient`: the operations `@nxgt/openapi-codegen` generates,
 * bound onto a client of `createHttpClient`. The client sends; the binding
 * adds what the spec knows: how each parameter and body is written, the
 * replies each operation declares, and checks by the server's own schemas.
 */
import {
	ClientError,
	type EventStream,
	type HttpClient,
	type Responses,
	ValidationError,
} from '@nxgt/httpyz';
import { METHODS } from '@nxgt/httpyz/integration';
import { checkRequest } from '../request/check-request';
import { type Input, toRequest } from '../request/to-request';
import type {
	OpenApiArgs,
	OpenApiClient,
	OpenApiOptions,
	OperationsShape,
	OperationTable,
	RoutesOf,
	RuntimeMedia,
	RuntimeOperation,
	StreamInit,
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

/** The stream an operation replies with, and its media type: the first of its 2xx replies. */
function streamOf(
	operation: RuntimeOperation,
): [type: string, media: RuntimeMedia] | undefined {
	for (const [status, content] of Object.entries(operation.responses)) {
		const code = Number(status);
		if (code < 200 || code > 299) continue;
		for (const [type, media] of Object.entries(content)) {
			if (media.kind === 'sse' || media.kind === 'jsonl') return [type, media];
		}
	}
	return undefined;
}

/**
 * `open()`'s stream, opened once `check` passes on the first read: a request
 * the spec refuses is never sent, and throws where the stream is read.
 */
function checkedFirst<T>(
	open: () => EventStream<T>,
	check: () => Promise<void>,
): EventStream<T> {
	let inner: EventStream<T> | undefined;
	let closed = false;
	return {
		get lastEventId() {
			return inner?.lastEventId;
		},
		close() {
			closed = true;
			inner?.close();
		},
		async *[Symbol.asyncIterator]() {
			if (!inner) {
				await check();
				if (closed) return;
				inner = open();
			}
			yield* inner;
		},
	};
}

/**
 * A client for a spec, bound to the `operations` table of the generated
 * `operations.ts`, which carries the spec's types: nothing else to import.
 *
 * ```ts
 * const http = createHttpClient({ baseUrl: 'https://api.example.com' });
 * const api = createOpenApiClient(http, operations);
 * const reply = await api.get('/employees/{id}', { param: { id } });
 * if (reply.status === 200) reply.data.name;
 * ```
 *
 * It checks the request and the reply, and returns each reply as its schema
 * outputs it, typed so. `decode: false` returns it as JSON carries it. The
 * types may also be given: `createOpenApiClient<ClientOperations,
 * OperationsByRoute, false>`, whose `false` then requires `decode: false`.
 */
export function createOpenApiClient<
	Ops extends OperationsShape<Ops>,
	Routes = RoutesOf<Ops>,
>(
	http: HttpClient,
	operations: OperationTable<Ops>,
	options: OpenApiOptions & { readonly decode: false },
): OpenApiClient<Ops, Routes, false>;
export function createOpenApiClient<
	Ops extends OperationsShape<Ops>,
	Routes = RoutesOf<Ops>,
	Decoded extends boolean = true,
>(
	http: HttpClient,
	operations: OperationTable<Ops>,
	...[given]: OpenApiArgs<Decoded>
): OpenApiClient<Ops, Routes, Decoded>;
export function createOpenApiClient<
	Ops extends OperationsShape<Ops>,
	Routes,
	Decoded extends boolean,
>(
	http: HttpClient,
	operations: OperationTable<Ops>,
	given?: OpenApiOptions & { readonly decode?: boolean },
): OpenApiClient<Ops, Routes, Decoded> {
	return bind(http, operations, given ?? {}, () => undefined);
}

/** Both signals: a call ends on either. */
const joined = (
	given: AbortSignal | null | undefined,
	scope: AbortSignal | undefined,
): AbortSignal | null | undefined =>
	scope === undefined ? given : given ? AbortSignal.any([given, scope]) : scope;

/**
 * The client, whose calls also end on `scope()`'s signal, read as each call
 * is made: a call checked before it is sent reaches the core client later,
 * after a `cancel()` of its group may already have swapped the signal.
 */
function bind<
	Ops extends OperationsShape<Ops>,
	Routes,
	Decoded extends boolean,
>(
	http: HttpClient,
	operations: OperationTable<Ops>,
	options: OpenApiOptions & { readonly decode?: boolean },
	scope: () => AbortSignal | undefined,
): OpenApiClient<Ops, Routes, Decoded> {
	const { validate = true } = options;
	const decode = options.decode !== false;
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

	/** The operation, and its arguments: the input, then the init. */
	const read = (id: string, args: readonly unknown[]) => {
		const operation = table[id];
		if (!operation) throw new Error(`${id} is not an operationId of the spec`);
		// An operation that takes nothing has no input: its first argument is the init.
		const takes =
			operation.parameters.length > 0 ||
			Object.keys(operation.body?.content ?? {}).length > 0;
		const input = (takes ? args[0] : undefined) as Input | undefined;
		const given = ((takes ? args[1] : args[0]) ?? {}) as StreamInit;
		const signal = joined(given.signal, scope());
		const init = signal ? { ...given, signal } : given;
		return { operation, input, init };
	};

	/** Throws what the server would refuse, before anything is sent. */
	const check = async (
		id: string,
		operation: RuntimeOperation,
		input: Input | undefined,
	): Promise<void> => {
		if (!checks.request) return;
		const issues = await checkRequest(operation, input);
		if (issues.length === 0) return;
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
	};

	/** The core client's options for the input, written as the server reads it. */
	const written = (
		id: string,
		operation: RuntimeOperation,
		input: Input | undefined,
		init: object & { headers?: HeadersInit },
	) => {
		const headers = new Headers(init.headers);
		const { query, body } = toRequest(operation, input, headers);
		return {
			...init,
			...body,
			param: input?.param,
			query,
			headers,
			operationId: id,
		};
	};

	const call = async (
		id: string,
		args: readonly unknown[],
	): Promise<unknown> => {
		const { operation, input, init } = read(id, args);
		await check(id, operation, input);
		const request = http.request as (
			method: string,
			path: string,
			options: object,
		) => Promise<unknown>;
		return request(operation.method, operation.path, {
			...written(id, operation, input, init),
			responses: responses.get(id),
			validate: checks.response,
			decode,
		});
	};

	const stream = (id: string, args: readonly unknown[]) => {
		const { operation, input, init } = read(id, args);
		const found = streamOf(operation);
		if (!found) throw new Error(`${id} does not reply with a stream`);
		const [type, media] = found;
		const { reconnect, lastEventId, onUnknownEvent, ...rest } = init;
		const open = () => {
			const request = written(id, operation, input, rest);
			// The media type the spec declares, which may not be the core client's default.
			if (!request.headers.has('accept')) request.headers.set('accept', type);
			const common = {
				...request,
				method: operation.method,
				validate: checks.response,
				decode,
			};
			const openStream = (media.kind === 'sse' ? http.events : http.lines) as (
				path: string,
				options: object,
			) => EventStream<unknown>;
			return openStream(
				operation.path,
				media.kind === 'sse'
					? {
							...common,
							events: media.events,
							reconnect,
							lastEventId,
							onUnknownEvent,
						}
					: { ...common, item: media.item },
			);
		};
		return checks.request
			? checkedFirst(open, () => check(id, operation, input))
			: open();
	};

	const client: Record<string, unknown> = {
		operations,
		op: (id: string, ...args: unknown[]) => call(id, args),
		stream: (id: string, ...args: unknown[]) => stream(id, args),
		group: () => {
			const group = http.group();
			const bound = bind<Ops, Routes, Decoded>(
				group,
				operations,
				options,
				() => group.signal,
			);
			return Object.defineProperties(bound, {
				cancel: { enumerable: true, value: group.cancel },
				signal: { enumerable: true, get: () => group.signal },
			});
		},
	};
	// Only the spec's methods, as the types have them: no `trace` without a TRACE operation.
	const methods = new Set(Object.values(table).map(({ method }) => method));
	for (const method of METHODS) {
		if (!methods.has(method)) continue;
		client[method] = (path: string, ...args: unknown[]) => {
			const id = byRoute.get(`${method} ${path}`);
			if (id === undefined) {
				return Promise.reject(
					new ClientError({ method, path }, 'the spec has no operation at it'),
				);
			}
			return call(id, args);
		};
	}
	return client as unknown as OpenApiClient<Ops, Routes, Decoded>;
}
