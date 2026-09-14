/**
 * The types of a client bound to a generated spec. Every lookup is an index
 * into the interfaces the generator wrote (`ClientOperations`,
 * `OperationsByRoute`), so a call costs TypeScript the same whether the spec
 * has five operations or five hundred.
 */
import type {
	CallOptions,
	Method,
	StandardSchemaV1,
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
	readonly kind: 'json' | 'form' | 'text' | 'binary';
	readonly schema?: StandardSchemaV1;
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

/** The generated `operations` table, keyed like `ClientOperations`. */
export type OperationTable<Ops> = {
	readonly [K in keyof Ops]: RuntimeOperation;
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
 * replies' types, so a decoding client says so in its third type argument,
 * `createOpenApiClient<ClientOperations, OperationsByRoute, true>`, which in
 * turn requires `decode: true`. Decoding validates the reply.
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

/** The paths with an operation for method `M`: `'/items/{id}'` from `'get /items/{id}'`. */
type PathsOf<Routes, M extends Method> = keyof Routes extends infer Route
	? Route extends `${M} ${infer Path}`
		? Path
		: never
	: never;

type IdOf<
	Ops,
	Routes,
	M extends Method,
	P extends string,
> = Routes[`${M} ${P}` & keyof Routes] & keyof Ops;

export type OpenApiClient<
	Ops extends OperationsShape<Ops>,
	Routes = Record<never, never>,
	Decoded extends boolean = false,
> = {
	/** Calls an operation by its `operationId`. */
	op<K extends keyof Ops & string>(
		id: K,
		...args: Args<Ops, K>
	): Promise<WithResponse<OperationReply<Ops, K, Decoded>>>;
} & {
	/** Calls the operation at a path: `api.get('/employees/{id}', { param: { id } })`. */
	readonly [M in Method]: <P extends PathsOf<Routes, M>>(
		path: P,
		...args: Args<Ops, IdOf<Ops, Routes, M, P>>
	) => Promise<
		WithResponse<OperationReply<Ops, IdOf<Ops, Routes, M, P>, Decoded>>
	>;
};
