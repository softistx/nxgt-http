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
import type { StandardSchemaV1 } from '../schema/standard-schema';
import type { Open } from '../stream/connection';
import { eventStream } from '../stream/event-stream';
import { LINE_TYPES, lineStream } from '../stream/line-stream';
import type { ServerEvent } from '../stream/sse-parser';
import type { EventSchemas, ReconnectOptions } from '../stream/types';
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

/** What a request is built from, as the client reads a call's options. */
type Given = BodyInput &
	CallOptions & {
		readonly param?: Readonly<Record<string, unknown>>;
		readonly query?: QueryInput;
	};

type ReplyGiven = Given & {
	readonly responses?: Responses;
	readonly validate?: boolean;
	readonly decode?: boolean;
};

type StreamGiven = Given & {
	readonly method?: Method;
	readonly validate?: boolean;
	readonly decode?: boolean;
};

type EventsGiven = StreamGiven & {
	readonly events?: EventSchemas;
	readonly onUnknownEvent?: (event: ServerEvent) => void;
	readonly reconnect?: boolean | ReconnectOptions;
	readonly lastEventId?: string;
};

type LinesGiven = StreamGiven & { readonly item?: StandardSchemaV1 };

/** A stream reconnects by default, but for the methods a retry would not repeat. */
const RECONNECT_DELAY = 3000;

const contextOf = (
	method: string,
	path: string,
	operationId: string | undefined,
): CallContext =>
	operationId === undefined ? { method, path } : { method, path, operationId };

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

	/**
	 * A request's parts, from a call's options: its URL, and its init but for
	 * the signal. `adjust` has the last word on the headers.
	 */
	const build = async (
		method: Method,
		path: string,
		given: Given,
		adjust?: (headers: Headers) => void,
	) => {
		const {
			param,
			query,
			json,
			form,
			text,
			body,
			operationId,
			timeout = options.timeout,
			retry = options.retry,
			headers: own,
			signal,
			...rest
		} = given;
		const context = contextOf(method, path, operationId);
		const headers = await sharedHeaders();
		const callHeaders = new Headers(own);
		callHeaders.forEach((value, name) => {
			headers.set(name, value);
		});
		adjust?.(headers);
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
		const init = {
			...options.init,
			...rest,
			method: method.toUpperCase(),
			headers,
			body: payload,
			// A stream is sent as it is read, which fetch has to be told.
			...(payload instanceof ReadableStream ? { duplex: 'half' } : {}),
		} as RequestInit;
		return { context, url, init, timeout, retry, signal: signal ?? undefined };
	};

	const request = async (
		method: Method,
		path: string,
		given: ReplyGiven = {},
	): Promise<unknown> => {
		const { responses, validate = true, decode = true, ...call } = given;
		const built = await build(method, path, call);
		const { deadline, signal } = withDeadline(built.timeout, built.signal);
		const response = await dispatch(
			new Request(built.url, { ...built.init, signal }),
			built.context,
			built.timeout,
			deadline,
			built.retry,
		);
		return readReply(
			built.context,
			responses === undefined ? undefined : toSpec(responses),
			response,
			{ validate, decode },
		);
	};

	/**
	 * A stream's connections, each built afresh: its headers are run again and
	 * `Last-Event-ID` is added. `timeout` bounds one until its headers arrive,
	 * and no longer, since a stream has no end to wait for.
	 */
	const opener =
		(method: Method, path: string, call: Given, accept: string): Open =>
		async (stream, lastEventId) => {
			const built = await build(method, path, call, (headers) => {
				if (!headers.has('accept')) headers.set('accept', accept);
				if (lastEventId !== undefined) {
					headers.set('last-event-id', lastEventId);
				}
			});
			const deadline = new AbortController();
			const clock =
				built.timeout === undefined
					? undefined
					: setTimeout(
							() =>
								deadline.abort(
									new DOMException('The stream did not open', 'TimeoutError'),
								),
							built.timeout,
						);
			const signals = [stream, deadline.signal];
			if (built.signal) signals.push(built.signal);
			try {
				return await dispatch(
					new Request(built.url, {
						...built.init,
						signal: AbortSignal.any(signals),
					}),
					built.context,
					built.timeout,
					deadline.signal,
					built.retry,
				);
			} finally {
				clearTimeout(clock);
			}
		};

	const events = (path: string, given: EventsGiven = {}) => {
		const {
			events,
			onUnknownEvent,
			reconnect,
			lastEventId,
			validate = true,
			decode = true,
			method = 'get',
			...call
		} = given;
		const reconnects =
			reconnect === undefined
				? method !== 'post' && method !== 'patch'
				: reconnect !== false;
		const settings = typeof reconnect === 'object' ? reconnect : {};
		return eventStream({
			context: contextOf(method, path, call.operationId),
			open: opener(method, path, call, 'text/event-stream'),
			signal: call.signal ?? undefined,
			validate,
			decode,
			events,
			onUnknownEvent,
			reconnect: reconnects && {
				attempts: settings.attempts ?? Number.POSITIVE_INFINITY,
				delay: settings.delay ?? RECONNECT_DELAY,
			},
			lastEventId,
		});
	};

	const lines = (path: string, given: LinesGiven = {}) => {
		const {
			item,
			validate = true,
			decode = true,
			method = 'get',
			...call
		} = given;
		return lineStream({
			context: contextOf(method, path, call.operationId),
			open: opener(method, path, call, LINE_TYPES.slice(0, 2).join(', ')),
			signal: call.signal ?? undefined,
			validate,
			decode,
			item,
		});
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
		const context = contextOf(
			method,
			new URL(request.url).pathname,
			operationId,
		);
		const headers = await sharedHeaders();
		request.headers.forEach((value, name) => {
			headers.set(name, value);
		});
		const { deadline, signal } = withDeadline(timeout, request.signal);
		const sent = new Request(request, { headers, signal });
		return dispatch(sent, context, timeout, deadline, retry);
	};

	const client: Record<string, unknown> = {
		request: (method: Method, path: string, given?: ReplyGiven) =>
			request(method, path, given),
		send,
		events,
		lines,
	};
	for (const method of METHODS) {
		client[method] = (path: string, given?: ReplyGiven) =>
			request(method, path, given);
	}
	return client as HttpClient;
}
