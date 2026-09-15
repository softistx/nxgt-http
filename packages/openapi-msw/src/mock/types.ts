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
import type { Presets } from '../response/presets';

export interface OpenApiMswOptions {
	/**
	 * Where the API is, as the app calls it: `https://api.example.com/v1`.
	 * Default: the paths on any origin.
	 */
	baseUrl?: string;
	/**
	 * Checks with the spec's schemas: the request, answered with the server's
	 * 400 when it would refuse it, and the responses `response` writes, a
	 * `MockReplyError` when one is not what the spec declares. `true`, the
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

declare const mocked: unique symbol;

/**
 * A `Response` of `response`, the only thing a resolver returns besides
 * nothing. `response.untyped()` makes one of any `Response`.
 */
export type MockResponse = Response & { readonly [mocked]: true };

/** What a response is written with, after its body. */
export interface ResponseOptions<Type extends string = string> {
	/**
	 * The media type to write the body as: required when the status declares
	 * several the writer could write. Default: the only one.
	 */
	readonly type?: Type;
	/** Headers of the response. A `Content-Type` here wins over the declared one. */
	readonly headers?: HeadersInit;
	readonly statusText?: string;
}

/** What a media type's body is, as the generator classifies it. */
export type MediaKindOf<Type extends string> = Type extends
	| 'application/json'
	| `application/${string}+json`
	? 'json'
	: Type extends 'application/x-www-form-urlencoded' | 'multipart/form-data'
		? 'form'
		: Type extends `text/${string}`
			? 'text'
			: 'binary';

/** The media types a reply declares. */
type TypesOf<R extends DeclaredReply> = Extract<R['type'], string>;

type IsUnion<T, All = T> = T extends unknown
	? [All] extends [T]
		? false
		: true
	: never;

type OfKind<Types extends string, Kind> = Types extends unknown
	? MediaKindOf<Types> extends Kind
		? Types
		: never
	: never;

/**
 * A body and its options, the body typed by its media type. With a choice of
 * media types, `options.type` names one and is required.
 */
export type BodyArgs<R extends DeclaredReply, Types extends string> =
	true extends IsUnion<Types>
		? {
				[T in Types]: [
					data: Extract<R, { readonly type: T }>['data'],
					options: ResponseOptions<T> & { readonly type: T },
				];
			}[Types]
		: [
				data: Extract<R, { readonly type: Types }>['data'],
				options?: ResponseOptions<Types>,
			];

export type BodyWriter<R extends DeclaredReply, Types extends string> = (
	...args: BodyArgs<R, Types>
) => MockResponse;

/**
 * `response(status)`: the writers of the status's body. `body` writes any of
 * its media types, and `json`, `text`, `form` and `binary` exist for those it
 * declares. A status without content has `body(options?)` alone.
 */
export type StatusResponse<R extends DeclaredReply> = [TypesOf<R>] extends [
	never,
]
	? { body(options?: ResponseOptions<never>): MockResponse }
	: { body: BodyWriter<R, TypesOf<R>> } & {
			[K in MediaKindOf<TypesOf<R>>]: BodyWriter<R, OfKind<TypesOf<R>, K>>;
		};

/** `response.ok(item)`…: `response(status).body`, for each status declared that has a preset. */
export type ResponsePresets<R extends DeclaredReply> = {
	readonly [P in keyof Presets as Presets[P] extends R['status']
		? P
		: never]: StatusResponse<
		Extract<R, { readonly status: Presets[P] }>
	>['body'];
};

/**
 * `response(200).json(item)`, `response.ok(item)`: a response the operation
 * declares, the body typed by the status that comes first. `untyped()` and
 * `passthrough()` step outside the spec.
 */
export type ResponseFactory<R extends DeclaredReply> = (<
	Status extends R['status'],
>(
	status: Status,
) => StatusResponse<Extract<R, { readonly status: Status }>>) &
	ResponsePresets<R> & {
		/** A `Response` of your own, such as MSW's `HttpResponse.error()`: sent as it is, not checked. */
		untyped(response: Response): MockResponse;
		/** MSW's `passthrough()`: the request goes on to the network, as if unhandled. */
		passthrough(): MockResponse;
	};

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
	readonly response: ResponseFactory<Ops[K]['reply'] & DeclaredReply>;
	/**
	 * The request, sent to the network past MSW: the real `Response`, to read,
	 * or to return with `response.untyped()`.
	 */
	bypass(init?: RequestInit): Promise<Response>;
};

/** A response of `response`, or nothing, for the next handler. */
export type MockResult = MockResponse | undefined | void;

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
