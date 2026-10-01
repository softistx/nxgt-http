import { isAsyncIterable, toEventStream } from '../sse/event-stream';
import { BODILESS, type StatusCode } from '../types/status';

export interface ReplyInit {
	/** Headers added to this reply, over those set on `ctx.set.headers`. */
	readonly headers?: HeadersInit;
}

/**
 * What a handler returns: a status and the body sent with it. Its type is the
 * route's contract — the client reads the union of every `Reply` a handler
 * may return.
 *
 * Built by `ctx.reply(status, body)`, which checks the body against the
 * schema the route declares for that status.
 */
export class Reply<Status extends number = number, Body = unknown> {
	/**
	 * Never set: makes a `Reply` nominal. Without it a `Response` — a
	 * `status`, a `body`, `headers` — would pass for one, and a hook that
	 * returns either would type its `Response` as a reply.
	 */
	declare readonly '~reply': true;
	readonly status: Status;
	readonly body: Body;
	readonly headers: HeadersInit | undefined;

	constructor(status: Status, body: Body, init?: ReplyInit) {
		this.status = status;
		this.body = body;
		this.headers = init?.headers;
	}
}

/** Any reply, whatever its status and body. */
export type AnyReply = Reply<any, any>;

/**
 * `reply` without schemas: any status, any body. The body's type is kept, so
 * the client still reads it.
 */
export type FreeReplyFunction = <
	const Status extends StatusCode,
	const Body = undefined,
>(
	status: Status,
	body?: Body,
	init?: ReplyInit,
) => Reply<Status, Body>;

export const createReply: FreeReplyFunction = (status, body, init) =>
	new Reply(status, body as never, init);

const BINARY = (value: unknown): value is BodyInit =>
	value instanceof Blob ||
	value instanceof ReadableStream ||
	value instanceof ArrayBuffer ||
	ArrayBuffer.isView(value) ||
	value instanceof FormData ||
	value instanceof URLSearchParams;

/**
 * The `Response` a reply is sent as. A string is `text/plain`, a binary body
 * goes as it is, an async iterable is a stream of server-sent events, and
 * anything else is JSON. A body-less status sends none.
 */
export function toResponse(
	status: number,
	body: unknown,
	headers: Headers,
	signal?: AbortSignal,
): Response {
	if (BODILESS.has(status) || body === undefined) {
		return new Response(null, { status, headers });
	}
	if (typeof body === 'string') {
		if (!headers.has('content-type'))
			headers.set('content-type', 'text/plain;charset=utf-8');
		headers.set('content-length', String(Buffer.byteLength(body)));
		return new Response(body, { status, headers });
	}
	if (BINARY(body)) return new Response(body, { status, headers });
	if (isAsyncIterable(body)) {
		headers.set('content-type', 'text/event-stream');
		headers.set('cache-control', 'no-cache');
		headers.set('x-accel-buffering', 'no');
		return new Response(toEventStream(body, signal), { status, headers });
	}
	if (!headers.has('content-type'))
		headers.set('content-type', 'application/json');
	const json = JSON.stringify(body);
	headers.set('content-length', String(Buffer.byteLength(json)));
	return new Response(json, { status, headers });
}
