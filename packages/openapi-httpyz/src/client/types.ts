/**
 * The types of a client bound to a generated spec. Every lookup is an index
 * into the interfaces the generator wrote (`ClientOperations`,
 * `OperationsByRoute`), so a call costs TypeScript the same whether the spec
 * has five operations or five hundred.
 */
import type {
	CallOptions,
	EventStream,
	Method,
	ReconnectOptions,
	ServerEvent,
	StandardSchemaV1,
	Stream,
	WithResponse,
} from '@nxgt/httpyz';

/** What the binding reads of an entry of the generated `ClientOperations`. */
export interface ClientOperation {
	readonly method: Method;
	readonly path: string;
	/** What a call takes after the `operationId`: `[input]`, `[input?]` or `[]`. */
	readonly args: readonly unknown[];
	/** Every declared reply, `{ status; type; data }`, decoded. */
	readonly reply: unknown;
	/** The same replies as JSON carries them. */
	readonly wire: unknown;
	/** A reply read an item at a time, when the operation has one. */
	readonly stream?: OperationStream;
}

/** An operation's stream: server-sent events, or JSON lines. */
export interface OperationStream {
	readonly kind: 'sse' | 'jsonl';
	/** Each item, decoded: an event narrowed on `event`, or a line. */
	readonly item: unknown;
	/** Each item as JSON carries it. */
	readonly wire: unknown;
}

/** The generated `ClientOperations`: an entry per `operationId`. */
export type OperationsShape<Ops> = { [K in keyof Ops]: ClientOperation };

/** How a parameter is written: an entry of `parameters` in `operations.ts`. */
export interface RuntimeParameter {
	readonly name: string;
	readonly in: 'path' | 'query' | 'header';
	readonly required: boolean;
	/** A query list as `?a=1&a=2` (true) or `?a=1,2` (false). */
	readonly explode: boolean;
	readonly list: boolean;
}

export interface RuntimeMedia {
	readonly kind: 'json' | 'form' | 'text' | 'binary' | 'sse' | 'jsonl';
	readonly schema?: StandardSchemaV1;
	/** `sse`: each event's data, by name: a schema for JSON, `null` for text. */
	readonly events?: { readonly [event: string]: StandardSchemaV1 | null };
	/** `jsonl`: each item. */
	readonly item?: StandardSchemaV1;
}

/** What the binding reads of an entry of the generated `operations` table. */
export interface RuntimeOperation {
	readonly method: Method;
	/** As the spec writes it: `/employees/{id}`. */
	readonly path: string;
	readonly parameters: readonly RuntimeParameter[];
	/** The server's validators of each location, which read text: for `validate`. */
	readonly param?: StandardSchemaV1;
	readonly query?: StandardSchemaV1;
	readonly header?: StandardSchemaV1;
	readonly body?: {
		readonly required: boolean;
		readonly content: { readonly [mediaType: string]: RuntimeMedia };
	};
	readonly responses: {
		readonly [status: number]: { readonly [mediaType: string]: RuntimeMedia };
	};
}

/**
 * The generated `operations` table, keyed like `ClientOperations`. Each entry
 * carries its `ClientOperations` entry as `'~client'`, a type that is never
 * set, which is how `createOpenApiClient(http, operations)` infers `Ops`.
 */
export type OperationTable<Ops> = {
	readonly [K in keyof Ops]: RuntimeOperation & {
		readonly '~client'?: Ops[K];
	};
};

/** `OperationsByRoute`, worked out of `ClientOperations`: `'get /items/{id}'` to its `operationId`. */
export type RoutesOf<Ops extends OperationsShape<Ops>> = {
	[K in keyof Ops as `${Ops[K]['method']} ${Ops[K]['path']}`]: K;
};

export interface OpenApiOptions {
	/**
	 * Checks with the spec's schemas, throwing a `ValidationError`: the
	 * request before it is sent, the reply before it is returned. `true` is
	 * both. Default: neither, since the types already hold both to the spec.
	 */
	validate?:
		| boolean
		| { readonly request?: boolean; readonly response?: boolean };
}

/**
 * The binding's options, and `decode`, which returns each reply as its schema
 * outputs it: with `dates: 'date'`, a date-time as a `Date`. It changes the
 * replies' types: a client whose types are given says so in its third type
 * argument, `createOpenApiClient<ClientOperations, OperationsByRoute, true>`,
 * which in turn requires `decode: true`. Decoding validates the reply.
 */
export type OpenApiArgs<Decoded extends boolean> = Decoded extends true
	? [options: OpenApiOptions & { readonly decode: true }]
	: [options?: OpenApiOptions & { readonly decode?: false }];

/** What a call takes after its input: the core client's call options. */
export type OperationInit = Omit<CallOptions, 'operationId'>;

/** A call's arguments after the `operationId` or the path. */
export type Args<Ops extends OperationsShape<Ops>, K extends keyof Ops> = [
	...Ops[K]['args'],
	init?: OperationInit,
];

/** An operation's replies: decoded, or as JSON carries them. */
export type OperationReply<
	Ops extends OperationsShape<Ops>,
	K extends keyof Ops,
	Decoded extends boolean,
> = Decoded extends true ? Ops[K]['reply'] : Ops[K]['wire'];

/** The operations that reply with a stream. Worked out once per client type. */
export type StreamIds<Ops> = {
	[K in keyof Ops]: Ops[K] extends { readonly stream: OperationStream }
		? K
		: never;
}[keyof Ops] &
	string;

/** What a stream takes after its input: the call options, and for events, how to resume. */
export interface StreamInit extends OperationInit {
	/**
	 * Events only: connects again when the connection drops or the stream
	 * ends, as `EventSource` does. Default: on, but for POST and PATCH.
	 */
	reconnect?: boolean | ReconnectOptions;
	/** Events only: sent as `Last-Event-ID` on the first connection. */
	lastEventId?: string;
	/** Events only: an event the spec does not declare, which is not yielded. */
	onUnknownEvent?: (event: ServerEvent) => void;
}

/** A stream's arguments after the `operationId`. */
export type StreamArgs<
	Ops extends OperationsShape<Ops>,
	K extends keyof Ops,
> = [...Ops[K]['args'], init?: StreamInit];

/** What `stream()` returns: events narrowed on `event`, or lines; decoded, or as JSON carries them. */
export type OperationStreamOf<
	Ops extends OperationsShape<Ops>,
	K extends keyof Ops,
	Decoded extends boolean,
> = Ops[K] extends {
	readonly stream: {
		readonly kind: infer Kind;
		readonly item: infer Item;
		readonly wire: infer Wire;
	};
}
	? Kind extends 'sse'
		? EventStream<Decoded extends true ? Item : Wire>
		: Stream<Decoded extends true ? Item : Wire>
	: never;

/** A bound client whose calls end together. */
export type OpenApiGroup<
	Ops extends OperationsShape<Ops>,
	Routes = RoutesOf<Ops>,
	Decoded extends boolean = false,
> = OpenApiClient<Ops, Routes, Decoded> & {
	/**
	 * Aborts every call and stream of the group still running, with `reason`,
	 * or an `AbortError`. The group goes on: the calls made after it run.
	 */
	cancel(reason?: unknown): void;
	/** Aborts on the next `cancel()`: for work of your own that ends with the group's calls. */
	readonly signal: AbortSignal;
};

/** The paths with an operation for method `M`: `'/items/{id}'` from `'get /items/{id}'`. */
export type PathsOf<Routes, M extends Method> = keyof Routes extends infer Route
	? Route extends `${M} ${infer Path}`
		? Path
		: never
	: never;

/** The methods the spec has an operation for: the only ones a client offers. */
export type MethodsOf<Routes> = keyof Routes extends infer Route
	? Route extends `${infer M extends Method} ${string}`
		? M
		: never
	: never;

/** The `operationId` of the operation at `M P`. */
export type IdOf<
	Ops,
	Routes,
	M extends Method,
	P extends string,
> = Routes[`${M} ${P}` & keyof Routes] & keyof Ops;

export type OpenApiClient<
	Ops extends OperationsShape<Ops>,
	Routes = RoutesOf<Ops>,
	Decoded extends boolean = false,
> = {
	/** Calls an operation by its `operationId`. */
	op<K extends keyof Ops & string>(
		id: K,
		...args: Args<Ops, K>
	): Promise<WithResponse<OperationReply<Ops, K, Decoded>>>;
	/**
	 * Reads an operation's stream, an item at a time, by its `operationId`:
	 * its events, each narrowed on `event`, or its JSON lines. It connects when
	 * read: `for await (const event of api.stream('watchFeed', input))`.
	 */
	stream<K extends StreamIds<Ops>>(
		id: K,
		...args: StreamArgs<Ops, K>
	): OperationStreamOf<Ops, K, Decoded>;
	/**
	 * The same client over the core client's `group()`: its calls and streams
	 * also end on `cancel()`, a page's or a component's together.
	 */
	group(): OpenApiGroup<Ops, Routes, Decoded>;
	/**
	 * The generated `operations` the client was bound to: for a package built
	 * over it, such as `@nxgt/httpyz-query/openapi`, which reads the spec as
	 * the client does.
	 */
	readonly operations: OperationTable<Ops>;
} & {
	/**
	 * Calls the operation at a path: `api.get('/employees/{id}', { param: { id } })`.
	 * Only the methods the spec has an operation for are there.
	 */
	readonly [M in MethodsOf<Routes>]: <P extends PathsOf<Routes, M>>(
		path: P,
		...args: Args<Ops, IdOf<Ops, Routes, M, P>>
	) => Promise<
		WithResponse<OperationReply<Ops, IdOf<Ops, Routes, M, P>, Decoded>>
	>;
};
