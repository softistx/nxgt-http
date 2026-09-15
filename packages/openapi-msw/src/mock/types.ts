/**
 * The types of the mock: each handler typed by its operation, read from the
 * generated `ClientOperations` that the `operations` table carries.
 */
import type { ValidationFailure } from '@nxgt/httpyz';
import type {
	IdOf,
	MethodsOf,
	OperationsShape,
	OperationTable,
	PathsOf,
	RoutesOf,
} from '@nxgt/openapi-httpyz';
import type { HttpHandler, RequestHandlerOptions } from 'msw';

export interface OpenApiMswOptions {
	/**
	 * Where the API is, as the app calls it: `https://api.example.com/v1`.
	 * Default: the paths on any origin.
	 */
	baseUrl?: string;
	/**
	 * Checks with the spec's schemas: the request, answered with the server's
	 * 400 when it would refuse it, and the reply of `reply()`, a
	 * `MockReplyError` when it is not one the spec declares. `true`, the
	 * default, is both; an object turns off what it sets to `false`.
	 */
	validate?: boolean | { readonly request?: boolean; readonly reply?: boolean };
	/**
	 * Answers a request the spec refuses. Return a `Response` to send it, or
	 * nothing for the default: the 400 `@nxgt/openapi-hono` answers.
	 */
	onValidationError?: (
		failure: ValidationFailure,
		request: Request,
	) => Response | undefined | Promise<Response | undefined>;
}

/** A reply an operation declares, as `ClientOperations` has it. */
export interface DeclaredReply {
	readonly status: number;
	readonly type: unknown;
	readonly data: unknown;
}

export interface ReplyInit<Type = string> {
	/** Headers of the reply. A `Content-Type` here wins over the declared one. */
	readonly headers?: HeadersInit;
	/** The media type to reply with, when the status declares more than one. Default: the first. */
	readonly type?: Type;
}

/** What `reply(status, …)` takes after the status: its body, unless it has none, then its init. */
export type ReplyArgs<R extends DeclaredReply> = [R] extends [
	{ readonly data: undefined },
]
	? [init?: ReplyInit<never>]
	: [data: R['data'], init?: ReplyInit<Exclude<R['type'], undefined>>];

/**
 * `reply(200, item)`: a reply the operation declares, the body typed by the
 * status that comes first. It throws a `MockReplyError` for a status the
 * operation does not declare.
 */
export type Reply<R extends DeclaredReply> = <Status extends R['status']>(
	status: Status,
	...rest: ReplyArgs<Extract<R, { readonly status: Status }>>
) => Response;

/** The input of a call: `[input]`, `[input?]` or none. */
type InputOf<Args> = Args extends readonly []
	? {}
	: Args extends readonly [(infer Input)?]
		? NonNullable<Input>
		: {};

type KeysOf<U> = U extends unknown ? keyof U : never;

/** An input as it arrives: a binary body, whatever the client sent it as, is read as a `Blob`. */
type Arrived<Input> = {
	[K in keyof Input]: K extends 'body' ? Blob : Input[K];
};

/** Each member of a union of bodies, the others' keys absent: `{ json }` or `{ form }`. */
type Exclusive<U, All extends PropertyKey = KeysOf<U>> = U extends unknown
	? Arrived<U> & { readonly [K in Exclude<All, keyof U>]?: undefined }
	: never;

type Part<Input, K extends PropertyKey> = Input extends unknown
	? K extends keyof Input
		? NonNullable<Input[K]>
		: {}
	: never;

/**
 * The request as the resolver receives it: `param`, `query` and `header`, as
 * the spec's validators output them, and the body, as `json`, `form`, `text`
 * or a binary `body`, a `Blob`.
 */
export type MockInput<
	Ops extends OperationsShape<Ops>,
	K extends keyof Ops,
> = Exclusive<InputOf<Ops[K]['args']>> & {
	readonly param: Part<InputOf<Ops[K]['args']>, 'param'>;
	readonly query: Part<InputOf<Ops[K]['args']>, 'query'>;
	readonly header: Part<InputOf<Ops[K]['args']>, 'header'>;
};

/** What a resolver is called with. */
export type MockInfo<
	Ops extends OperationsShape<Ops>,
	K extends keyof Ops,
> = MockInput<Ops, K> & {
	/** The request, its body unread. */
	readonly request: Request;
	readonly cookies: Record<string, string>;
	readonly operationId: K;
	readonly reply: Reply<Ops[K]['reply'] & DeclaredReply>;
};

/** A reply of `reply()`, a `Response` of your own, or nothing, for the next handler. */
export type MockResult = Response | undefined | void;

export type MockResolver<
	Ops extends OperationsShape<Ops>,
	K extends keyof Ops,
> = (info: MockInfo<Ops, K>) => MockResult | Promise<MockResult>;

/** `mock.get(path, resolver)`…: only the methods the spec has an operation for. */
export type MockPathMethods<Ops extends OperationsShape<Ops>, Routes> = {
	readonly [M in MethodsOf<Routes>]: <P extends PathsOf<Routes, M>>(
		path: P,
		resolver: MockResolver<Ops, IdOf<Ops, Routes, M, P>>,
		options?: RequestHandlerOptions,
	) => HttpHandler;
};

export type OpenApiMsw<
	Ops extends OperationsShape<Ops>,
	Routes = RoutesOf<Ops>,
> = {
	/** The handler of an operation, by its `operationId`. */
	op<K extends keyof Ops & string>(
		id: K,
		resolver: MockResolver<Ops, K>,
		options?: RequestHandlerOptions,
	): HttpHandler;
	/** The generated `operations` the mock was bound to. */
	readonly operations: OperationTable<Ops>;
} & MockPathMethods<Ops, Routes>;
