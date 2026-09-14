/**
 * `createHttpClient`: calls over the standard `fetch`, each typed by its path
 * and by the replies it declares, through `retry`, `auth` and middleware.
 */
import { type CallContext, NetworkError, TimeoutError } from '../errors/errors';
import { auth } from '../middleware/auth';
import { compose, type Next } from '../middleware/compose';
import {
	type RetryOptions,
	retrying,
	retrySettings,
} from '../middleware/retry';
import { readReply, toSpec } from '../reply/read-reply';
import type { Responses } from '../reply/types';
import { fillPath, joinUrl, writeBody, writeQuery } from '../request/encode';
import type { BodyInput, QueryInput } from '../request/types';
import type {
	CallOptions,
	HttpClient,
	HttpClientOptions,
	Method,
	SendOptions,
} from './types';

export const METHODS: readonly Method[] = [
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

/** Every option a call may take, as the client reads them. */
type Given = BodyInput &
	CallOptions & {
		readonly param?: Readonly<Record<string, unknown>>;
		readonly query?: QueryInput;
		readonly responses?: Responses;
		readonly validate?: boolean;
		readonly decode?: boolean;
	};

/**
 * ```ts
 * const http = createHttpClient({ baseUrl: 'https://api.example.com', retry: 2 });
 * const reply = await http.get('/employees/{id}', {
 * 	param: { id },
 * 	responses: { 200: Employee, 404: Problem },
 * });
 * if (reply.status === 200) reply.data.name;
 * ```
 */
export function createHttpClient(options: HttpClientOptions = {}): HttpClient {
	const signer = options.auth ? auth(options.auth) : undefined;
	const sharedHeaders = async (): Promise<Headers> =>
		new Headers(
			typeof options.headers === 'function'
				? await options.headers()
				: options.headers,
		);

	/** The request's own signal, with `timeout`'s deadline added. */
	const withDeadline = (
		timeout: number | undefined,
		signal: AbortSignal | null | undefined,
	) => {
		const deadline =
			timeout === undefined ? undefined : AbortSignal.timeout(timeout);
		const signals = [signal, deadline].filter(
			(each): each is AbortSignal => each != null,
		);
		return {
			deadline,
			signal: signals.length > 1 ? AbortSignal.any(signals) : signals[0],
		};
	};

	/** Through `retry`, `auth` and `use` to `fetch`, fetch's failure and the deadline made errors. */
	const dispatch = async (
		request: Request,
		context: CallContext,
		timeout: number | undefined,
		deadline: AbortSignal | undefined,
		retry: number | RetryOptions | false | undefined,
	): Promise<Response> => {
		const fetch = options.fetch ?? ((sent: Request) => globalThis.fetch(sent));
		// fetch's own failure is a NetworkError, which `retry` retries; an abort is not one.
		const send: Next = async (sent) => {
			try {
				// As fetch does: a signal aborted before the call never sends.
				sent.signal.throwIfAborted();
				return await fetch(sent);
			} catch (error) {
				if (request.signal.aborted) throw error;
				throw new NetworkError(context, { cause: error });
			}
		};
		const again = retrySettings(retry);
		const layers = [
			...(again ? [retrying(again)] : []),
			...(signer ? [signer] : []),
			...(options.use ?? []),
		];
		try {
			return await compose(layers, send, context)(request);
		} catch (error) {
			if (deadline?.aborted && timeout !== undefined) {
				throw new TimeoutError(context, timeout, { cause: error });
			}
			throw error;
		}
	};

	const request = async (
		method: Method,
		path: string,
		given: Given = {},
	): Promise<unknown> => {
		const {
			param,
			query,
			json,
			form,
			text,
			body,
			responses,
			validate = true,
			decode = true,
			operationId,
			timeout = options.timeout,
			retry = options.retry,
			headers: own,
			signal,
			...rest
		} = given;
		const context: CallContext =
			operationId === undefined
				? { method, path }
				: { method, path, operationId };
		const headers = await sharedHeaders();
		const callHeaders = new Headers(own);
		callHeaders.forEach((value, name) => {
			headers.set(name, value);
		});
		const url = joinUrl(
			options.baseUrl,
			fillPath(context, param),
			writeQuery(query),
		);
		const payload = writeBody(
			{ json, form, text, body } as BodyInput,
			headers,
			callHeaders.get('content-type'),
		);
		const { deadline, signal: combined } = withDeadline(timeout, signal);
		const sent = new Request(url, {
			...options.init,
			...rest,
			method: method.toUpperCase(),
			headers,
			body: payload,
			signal: combined,
			// A stream is sent as it is read, which fetch has to be told.
			...(payload instanceof ReadableStream ? { duplex: 'half' } : {}),
		} as RequestInit);
		const response = await dispatch(sent, context, timeout, deadline, retry);
		return readReply(
			context,
			responses === undefined ? undefined : toSpec(responses),
			response,
			{ validate, decode },
		);
	};

	const send = async (
		request: Request,
		{
			timeout = options.timeout,
			retry = options.retry,
			operationId,
		}: SendOptions = {},
	): Promise<Response> => {
		const method = request.method.toLowerCase();
		const path = new URL(request.url).pathname;
		const context: CallContext =
			operationId === undefined
				? { method, path }
				: { method, path, operationId };
		const headers = await sharedHeaders();
		request.headers.forEach((value, name) => {
			headers.set(name, value);
		});
		const { deadline, signal } = withDeadline(timeout, request.signal);
		const sent = new Request(request, { headers, signal });
		return dispatch(sent, context, timeout, deadline, retry);
	};

	const client: Record<string, unknown> = {
		request: (method: Method, path: string, given?: Given) =>
			request(method, path, given),
		send,
	};
	for (const method of METHODS) {
		client[method] = (path: string, given?: Given) =>
			request(method, path, given);
	}
	return client as HttpClient;
}
