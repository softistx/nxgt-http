/** The client, its options, and what each call takes. */
import type { AuthOptions } from '../middleware/auth';
import type { Middleware } from '../middleware/compose';
import type { RetryOptions } from '../middleware/retry';
import type { HttpReply, Responses } from '../reply/types';
import type { PathParamNames, RequestInput } from '../request/types';
import type { StandardSchemaV1 } from '../schema/standard-schema';
import type {
	EventSchemas,
	EventStream,
	EventsOptions,
	LinesOptions,
	Stream,
	StreamEvent,
	StreamItem,
} from '../stream/types';

/** HTTP's methods, as OpenAPI lists them, and `query`. */
export type Method =
	| 'get'
	| 'put'
	| 'post'
	| 'delete'
	| 'options'
	| 'head'
	| 'patch'
	| 'trace'
	| 'query';

export interface HttpClientOptions {
	/**
	 * Where the API is served: `https://api.example.com`, or with a prefix,
	 * `https://example.com/api`. Without one, URLs are relative, which only a
	 * browser resolves.
	 */
	baseUrl?: string | URL;
	/** Sends each request. Default: `globalThis.fetch`, looked up at each call. */
	fetch?: (request: Request) => Promise<Response>;
	/** Sent with every request. A function runs before each one. */
	headers?: HeadersInit | (() => HeadersInit | Promise<HeadersInit>);
	/** fetch options for every request: `credentials`, `mode`, `cache`… */
	init?: Omit<RequestInit, 'method' | 'body' | 'headers' | 'signal'>;
	/** Milliseconds before a call fails with a `TimeoutError`. Default: none. */
	timeout?: number;
	/** A token on every request, refreshed once on a 401. */
	auth?: AuthOptions;
	/**
	 * Sends a request again after a failure that may pass: a number of
	 * retries, or `RetryOptions`. Default: never.
	 */
	retry?: number | RetryOptions | false;
	/** Around every request, the first outermost, inside `retry` and `auth`. */
	use?: readonly Middleware[];
}

/** What any call may add: fetch's own options, and its own timeout and retry. */
export interface CallOptions
	extends Omit<RequestInit, 'method' | 'body' | 'headers'> {
	/** Over the client's `headers`. A `Content-Type` here wins over the body's own. */
	headers?: HeadersInit;
	/** This call's `timeout`, instead of the client's. */
	timeout?: number;
	/** This call's `retry`, instead of the client's: `false` never retries. */
	retry?: number | RetryOptions | false;
	/** Names the call, in its errors and to middleware: an OpenAPI `operationId`. */
	operationId?: string;
}

export interface ReplyOptions<
	R extends Responses | undefined,
	Decoded extends boolean,
> {
	/**
	 * The replies the call expects, by status: a schema for JSON, `null` for
	 * no content, or a schema per media type. A status not in it throws an
	 * `UndeclaredStatusError`. Without it, every reply is returned, read by
	 * its media type, as `unknown`.
	 */
	responses?: R;
	/** Checks each reply with its schema, throwing a `ValidationError`. Default: `true`. */
	validate?: boolean;
	/** Returns what each schema outputs, rather than what it was given. Default: `true`. */
	decode?: Decoded;
}

export type RequestOptions<
	Path extends string,
	R extends Responses | undefined = undefined,
	Decoded extends boolean = true,
> = RequestInput<Path> & CallOptions & ReplyOptions<R, Decoded>;

/** Options for a call to `Path`: required when the path has `{name}`s to fill. */
export type ArgsFor<Path extends string, Options> = [
	PathParamNames<Path>,
] extends [never]
	? [options?: Options]
	: [options: Options];

export type RequestArgs<
	Path extends string,
	R extends Responses | undefined,
	Decoded extends boolean,
> = ArgsFor<Path, RequestOptions<Path, R, Decoded>>;

export type EventsArgs<
	Path extends string,
	E extends EventSchemas | undefined,
	Decoded extends boolean,
> = ArgsFor<Path, RequestInput<Path> & EventsOptions<E, Decoded>>;

export type LinesArgs<
	Path extends string,
	I extends StandardSchemaV1 | undefined,
	Decoded extends boolean,
> = ArgsFor<Path, RequestInput<Path> & LinesOptions<I, Decoded>>;

/** `http.get(path, options)`, and the other methods. */
export type Call = <
	Path extends string,
	R extends Responses | undefined = undefined,
	Decoded extends boolean = true,
>(
	path: Path,
	...args: RequestArgs<Path, R, Decoded>
) => Promise<HttpReply<R, Decoded>>;

export interface SendOptions {
	timeout?: number;
	retry?: number | RetryOptions | false;
	operationId?: string;
}

export type HttpClient = {
	/** A call with the method as a value: `http.request('get', '/items/{id}', { param })`. */
	request<
		Path extends string,
		R extends Responses | undefined = undefined,
		Decoded extends boolean = true,
	>(
		method: Method,
		path: Path,
		...args: RequestArgs<Path, R, Decoded>
	): Promise<HttpReply<R, Decoded>>;
	/**
	 * A `Request` of your own, through the client's `retry`, `auth`, `use`
	 * and timeout, with its `headers` added where the request has none. Its
	 * `Response` is returned as it is.
	 */
	send(request: Request, options?: SendOptions): Promise<Response>;
	/**
	 * Server-sent events, read with `for await`, each narrowed on its
	 * `event`: `http.events('/feed', { events: { update: Item } })`. It
	 * connects when read, and reconnects as `EventSource` does. `timeout`
	 * bounds each connection until its headers arrive, not the stream.
	 */
	events<
		Path extends string,
		E extends EventSchemas | undefined = undefined,
		Decoded extends boolean = true,
	>(
		path: Path,
		...args: EventsArgs<Path, E, Decoded>
	): EventStream<StreamEvent<E, Decoded>>;
	/**
	 * JSON Lines, NDJSON or JSON text sequences, a record at a time, each
	 * checked by `item`: `http.lines('/export', { item: Row })`.
	 */
	lines<
		Path extends string,
		I extends StandardSchemaV1 | undefined = undefined,
		Decoded extends boolean = true,
	>(
		path: Path,
		...args: LinesArgs<Path, I, Decoded>
	): Stream<StreamItem<I, Decoded>>;
} & { readonly [M in Method]: Call };
