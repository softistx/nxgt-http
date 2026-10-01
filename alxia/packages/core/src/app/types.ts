/**
 * The types an app is made of: what a route declares, what its handler
 * reads, and the record of it the client is typed from.
 */
import type { InternalErrorBody, ValidationErrorBody } from '../errors/errors';
import type {
	AnyReply,
	FreeReplyFunction,
	Reply,
	ReplyInit,
} from '../reply/reply';
import type {
	InferInput,
	InferOutput,
	StandardSchemaV1,
} from '../schema/standard-schema';
import type { Jsonify, Simplify } from '../types/json';
import type { PathParamName, PathParams } from '../types/path';
import type { RedirectStatus, StatusCode } from '../types/status';

export type Method =
	| 'GET'
	| 'POST'
	| 'PUT'
	| 'PATCH'
	| 'DELETE'
	| 'OPTIONS'
	| 'HEAD';

/** No properties: the identity of `&`. */
export type Empty = Record<never, never>;

export type MaybePromise<Value> = Value | Promise<Value>;

/** A schema per status the route may answer. */
export type ResponseSchemas = {
	readonly [Status in StatusCode]?: StandardSchemaV1;
};

/** What OpenAPI says of a route, and nothing at runtime. */
export interface RouteDetail {
	readonly summary?: string;
	readonly description?: string;
	readonly operationId?: string;
	readonly tags?: readonly string[];
	readonly deprecated?: boolean;
}

/**
 * What a route validates. Every part is optional, and each one may be any
 * Standard Schema: Zod, Valibot, ArkType, or one written by hand.
 */
export interface RouteSchema {
	/** The path parameters, which arrive as strings: a schema that coerces reads `/users/:id` as a number. */
	readonly params?: StandardSchemaV1;
	/** The query string: a key given once is a string, given more than once an array. */
	readonly query?: StandardSchemaV1;
	/** The request headers, names lowercased. */
	readonly headers?: StandardSchemaV1;
	/** The request cookies, by name. */
	readonly cookies?: StandardSchemaV1;
	/** The body, read as its `content-type` says: JSON, a form, or text. */
	readonly body?: StandardSchemaV1;
	/** The body of each status the route may answer. Its handler can answer no other. */
	readonly response?: ResponseSchemas;
	readonly detail?: RouteDetail;
}

type SchemaAt<Schema, Key extends keyof RouteSchema> = Key extends keyof Schema
	? Schema[Key] extends StandardSchemaV1
		? Schema[Key]
		: never
	: never;

type OutputAt<Schema, Key extends keyof RouteSchema, Fallback> = [
	SchemaAt<Schema, Key>,
] extends [never]
	? Fallback
	: InferOutput<SchemaAt<Schema, Key>>;

type ResponsesOf<Schema> = Schema extends {
	readonly response: infer Responses extends ResponseSchemas;
}
	? Responses
	: never;

type StatusOf<Responses> = keyof Responses & StatusCode;

type ResponseSchemaAt<Responses, Status> = Status extends keyof Responses
	? Exclude<Responses[Status], undefined> extends infer Schema extends
			StandardSchemaV1
		? Schema
		: never
	: never;

/** The rest of `reply(status, ...)`: the body may be left out when the schema takes `undefined`. */
type ReplyRest<Body> = undefined extends Body
	? [body?: Body, init?: ReplyInit]
	: [body: Body, init?: ReplyInit];

/**
 * `reply` with schemas: only a status the route declares, with a body its
 * schema accepts.
 */
export type TypedReplyFunction<Responses extends ResponseSchemas> = <
	const Status extends StatusOf<Responses>,
>(
	status: Status,
	...rest: ReplyRest<InferInput<ResponseSchemaAt<Responses, Status>>>
) => Reply<Status, InferInput<ResponseSchemaAt<Responses, Status>>>;

/** Every reply a route with schemas may return. */
export type DeclaredReply<Responses extends ResponseSchemas> = {
	[Status in StatusOf<Responses>]: Reply<
		Status,
		InferInput<ResponseSchemaAt<Responses, Status>>
	>;
}[StatusOf<Responses>];

export type RedirectFunction = <const Status extends RedirectStatus = 302>(
	location: string | URL,
	status?: Status,
) => Reply<Status, undefined>;

/** What every hook reads, routed or not. */
export interface RequestContext {
	readonly request: Request;
	readonly url: URL;
	/** The server that took the request; none when the app is called through `fetch` alone. */
	readonly server: Bun.Server<unknown> | undefined;
	/** The client's address, as the app's `ip` option reads it. */
	readonly ip: string | undefined;
	/**
	 * The route the request reached, as declared — `/users/:id` — once
	 * routing has run; `undefined` before, and for a request that reached
	 * none. What an `around` hook names a span after.
	 */
	readonly route: string | undefined;
	/** The error a route failed with, once it has: what became its 500, or its `onError` reply. */
	readonly error: unknown;
}

/** What a route sets on its response, whatever the status. */
export interface ResponseSettings {
	readonly headers: Headers;
	/** Cookies set or deleted: each change is a `Set-Cookie` header. */
	readonly cookies: Bun.CookieMap;
}

/** What every route hook and handler reads, before the request is validated. */
export interface BaseContext extends RequestContext {
	/** The route's path as declared, `/users/:id`, not as requested. */
	readonly route: string;
	/**
	 * The path parameters as they arrived, before the route's `params`
	 * schema: what a hook reads, since it runs before validation.
	 */
	readonly pathParams: Readonly<Record<string, string>>;
	readonly set: ResponseSettings;
	/** A reply that ends the request here. A hook's is added to every route after it. */
	readonly reply: FreeReplyFunction;
	readonly redirect: RedirectFunction;
}

/** What a handler reads: the request validated, and what each hook added. */
export type Context<Ctx, Path extends string, Schema> = Omit<
	BaseContext,
	'reply'
> &
	Ctx & {
		readonly params: OutputAt<Schema, 'params', PathParams<Path>>;
		readonly query: OutputAt<
			Schema,
			'query',
			Readonly<Record<string, string | readonly string[]>>
		>;
		readonly headers: OutputAt<
			Schema,
			'headers',
			Readonly<Record<string, string>>
		>;
		readonly cookies: OutputAt<
			Schema,
			'cookies',
			Readonly<Record<string, string>>
		>;
		readonly body: OutputAt<Schema, 'body', undefined>;
		readonly reply: [ResponsesOf<Schema>] extends [never]
			? FreeReplyFunction
			: TypedReplyFunction<ResponsesOf<Schema>>;
	};

/** What a handler may return. */
export type HandlerResult<Schema> = [ResponsesOf<Schema>] extends [never]
	? AnyReply
	: DeclaredReply<ResponsesOf<Schema>> | Reply<RedirectStatus, undefined>;

/**
 * The checks the type of a route's schema cannot express on its own. A
 * mistake comes back as a property whose type is the message.
 */
export type ValidSchema<Path extends string, Schema> = UnknownKeys<Schema> &
	ParamsMatchPath<Path, Schema> &
	KnownStatuses<Schema>;

type UnknownKeys<Schema> = [Exclude<keyof Schema, keyof RouteSchema>] extends [
	never,
]
	? unknown
	: {
			readonly [Key in Exclude<
				keyof Schema,
				keyof RouteSchema
			>]: `"${Key & string}" is not a part of a route: params, query, headers, cookies, body, response or detail`;
		};

type ParamsMatchPath<Path extends string, Schema> = Schema extends {
	readonly params: infer Params extends StandardSchemaV1;
}
	? PathParams<Path> extends InferInput<Params>
		? keyof InferInput<Params> extends PathParamName<Path>
			? unknown
			: {
					readonly params: `the params schema reads keys "${Path}" does not declare`;
				}
		: {
				readonly params: `the params schema must accept the parameters of "${Path}", which arrive as strings`;
			}
	: unknown;

type KnownStatuses<Schema> = Schema extends {
	readonly response: infer Responses;
}
	? [Exclude<keyof Responses, StatusCode>] extends [never]
		? unknown
		: {
				readonly response: `${Exclude<keyof Responses, StatusCode> & (string | number)} is not an HTTP status`;
			}
	: unknown;

/** One outcome of a call: a status, and the body read from it. */
export interface Outcome<Status extends number = number, Data = unknown> {
	readonly status: Status;
	readonly data: Data;
}

/** The outcomes of the replies in `Replies`. */
export type OutcomeOf<Replies> =
	Replies extends Reply<infer Status, infer Body>
		? Outcome<Status, Jsonify<Body>>
		: never;

type ValidatesRequest<Schema> = [
	SchemaAt<Schema, 'params' | 'query' | 'headers' | 'cookies' | 'body'>,
] extends [never]
	? false
	: true;

/** Every outcome a client may read from a route. */
export type RouteOutput<Schema, Result, Shortcuts> =
	| ([ResponsesOf<Schema>] extends [never]
			? OutcomeOf<Result>
			:
					| {
							[Status in StatusOf<ResponsesOf<Schema>>]: Outcome<
								Status,
								Jsonify<
									InferOutput<ResponseSchemaAt<ResponsesOf<Schema>, Status>>
								>
							>;
					  }[StatusOf<ResponsesOf<Schema>>]
					| OutcomeOf<Extract<Result, Reply<RedirectStatus, undefined>>>)
	| OutcomeOf<Shortcuts>
	| (ValidatesRequest<Schema> extends true
			? Outcome<400, ValidationErrorBody>
			: never)
	| Outcome<500, InternalErrorBody>;

type PartInput<Schema, Key extends 'query' | 'headers' | 'cookies' | 'body'> = [
	SchemaAt<Schema, Key>,
] extends [never]
	? Empty
	: undefined extends InferInput<SchemaAt<Schema, Key>>
		? { readonly [Part in Key]?: InferInput<SchemaAt<Schema, Key>> }
		: Empty extends InferInput<SchemaAt<Schema, Key>>
			? { readonly [Part in Key]?: InferInput<SchemaAt<Schema, Key>> }
			: { readonly [Part in Key]: InferInput<SchemaAt<Schema, Key>> };

/** Cookies are optional to a client: a browser sends its own. */
type CookiesInput<Schema> = [SchemaAt<Schema, 'cookies'>] extends [never]
	? Empty
	: { readonly cookies?: InferInput<SchemaAt<Schema, 'cookies'>> };

type ParamsInput<Path extends string> = [PathParamName<Path>] extends [never]
	? Empty
	: {
			readonly params: {
				readonly [Name in PathParamName<Path>]: string | number;
			};
		};

/** What a client sends a route. */
export type RouteInput<Path extends string, Schema> = Simplify<
	ParamsInput<Path> &
		PartInput<Schema, 'query'> &
		PartInput<Schema, 'headers'> &
		CookiesInput<Schema> &
		PartInput<Schema, 'body'>
>;

/** A route, as the client knows it. */
export interface RouteRecord<Input = unknown, Output = unknown> {
	readonly input: Input;
	readonly output: Output;
}

/** Routes by path, then by method. */
export type RouteTable = {
	readonly [path: string]: { readonly [method in Method]?: RouteRecord };
};

export type RouteEntryOf<
	M extends Method,
	Path extends string,
	Schema,
	Result,
	Shortcuts,
> = {
	readonly [P in Path]: {
		readonly [Key in M]: RouteRecord<
			RouteInput<Path, Schema>,
			RouteOutput<Schema, Result, Shortcuts>
		>;
	};
};
