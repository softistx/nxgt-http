/**
 * The types of a client. Every lookup is an index into the interfaces the
 * generator wrote (`ClientOperations`, `OperationsByRoute`), so a call costs
 * TypeScript the same whether the spec has five operations or five hundred.
 */

/** OpenAPI's eight methods, and 3.2's `query`. */
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

/** What the client reads of an entry of the generated `ClientOperations`. */
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
	readonly schema?: unknown;
}

/** What the client reads of an entry of the generated `operations` table. */
export interface RuntimeOperation {
	readonly method: Method;
	/** As the spec writes it: `/employees/{id}`. */
	readonly path: string;
	readonly parameters: readonly RuntimeParameter[];
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

export interface ClientOptions {
	/**
	 * Where the API is served: `https://api.example.com`, or with a prefix,
	 * `https://example.com/api`. Without one, URLs are relative, which only a
	 * browser resolves.
	 */
	baseUrl?: string | URL;
	/** Sends each request. Default: `globalThis.fetch`, looked up at each call. */
	fetch?: (request: Request) => Promise<Response>;
	/** Sent with every request. A function runs before each one, so a token can be fresh. */
	headers?: HeadersInit | (() => HeadersInit | Promise<HeadersInit>);
	/** fetch options for every request: `credentials`, `mode`, `cache`… */
	init?: Omit<RequestInit, 'method' | 'body' | 'headers' | 'signal'>;
	/** Milliseconds before a call fails with a `TimeoutError`. Default: none. */
	timeout?: number;
}

/** What a call takes after its input: fetch's own options, and a timeout. */
export interface CallInit extends Omit<RequestInit, 'method' | 'body'> {
	/** Milliseconds before this call fails with a `TimeoutError`, instead of the client's. */
	timeout?: number;
}

/** A call's arguments after the `operationId` or the path. */
export type Args<Ops extends OperationsShape<Ops>, K extends keyof Ops> = [
	...Ops[K]['args'],
	init?: CallInit,
];

/**
 * A reply, with the `Response` it was read from: for its headers, since its
 * body has been read into `data`. A union of replies stays one, so a check of
 * `status` narrows `data`.
 */
export type Result<Reply> = Reply & { readonly response: Response };

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

export type Client<
	Ops extends OperationsShape<Ops>,
	Routes = Record<never, never>,
> = {
	/** Calls an operation by its `operationId`. */
	op<K extends keyof Ops & string>(
		id: K,
		...args: Args<Ops, K>
	): Promise<Result<Ops[K]['wire']>>;
} & {
	/** Calls the operation at a path: `api.get('/employees/{id}', { param: { id } })`. */
	readonly [M in Method]: <P extends PathsOf<Routes, M>>(
		path: P,
		...args: Args<Ops, IdOf<Ops, Routes, M, P>>
	) => Promise<Result<Ops[IdOf<Ops, Routes, M, P>]['wire']>>;
};
