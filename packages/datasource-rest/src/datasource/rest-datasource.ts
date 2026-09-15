/**
 * `RESTDataSource`: a REST service, called from a GraphQL resolver or any
 * server code, through the client `@nxgt/openapi-httpyz` binds to its spec.
 * The caller's token is forwarded, reads are cached, and a call that fails
 * becomes one `DataSourceError`.
 */
import {
	type Cache,
	createHttpClient,
	type HttpClientOptions,
	isAbortError,
	ok,
	cache as replies,
	type Success,
	UndeclaredStatusError,
} from '@nxgt/httpyz';
import { METHODS } from '@nxgt/httpyz/integration';
import {
	createOpenApiClient,
	type OpenApiArgs,
	type OpenApiClient,
	type OpenApiOptions,
	type OperationsShape,
	type OperationTable,
	type PathMethods,
	type RoutesOf,
} from '@nxgt/openapi-httpyz';
import { toDataSourceError } from '../errors/data-source-error';

type Token = string | null | undefined;

/**
 * The cache every datasource shares unless it is given its own: a server
 * makes its datasources per request, and each would otherwise start empty.
 * It keeps the reads, `GET`, `HEAD` and `QUERY`, a search by what it searches
 * for. It is keyed by the caller's token, so no caller is answered with
 * another's reply. `defaultCache.clear()` empties it.
 */
export const defaultCache: Cache = replies();

export interface RESTDataSourceOptions<Ops> extends OpenApiOptions {
	/** The service's base URL. */
	baseUrl: string;
	/** The `operations` table generated from the service's spec. */
	operations: OperationTable<Ops>;
	/**
	 * Sent as `Authorization: Bearer <token>`: the caller's, forwarded. A
	 * function is read, and awaited, before each request. None sends no header.
	 */
	token?: Token | (() => Token | Promise<Token>);
	/** Default: `defaultCache`, shared by every datasource. `false`: none. */
	cache?: Cache | false;
	/** What else the core client takes: `headers`, `timeout`, `retry`, `use`, `fetch`… */
	http?: Omit<HttpClientOptions, 'baseUrl' | 'auth'>;
}

/** `decode`, as the binding takes it: a datasource typed as decoding must decode. */
type Decoding<Decoded extends boolean> = {
	readonly decode?: Decoded;
} & (Decoded extends true ? { readonly decode: true } : unknown);

/** The datasource's own members; `RESTDataSource` adds the client's path methods. */
class DataSource<
	Ops extends OperationsShape<Ops>,
	Routes,
	Decoded extends boolean,
> {
	/** The client bound to the spec, for `op()`, `stream()` and `group()`. */
	readonly api: OpenApiClient<Ops, Routes, Decoded>;

	constructor(options: RESTDataSourceOptions<Ops> & Decoding<Decoded>) {
		const {
			baseUrl,
			operations,
			token,
			cache = defaultCache,
			http = {},
			...binding
		} = options;
		const client = createHttpClient({
			...http,
			baseUrl,
			...(token === undefined
				? {}
				: {
						auth: { token: typeof token === 'function' ? token : () => token },
					}),
			// Inside `auth`, so the cache is keyed by the token it sent.
			use: [...(cache ? [cache] : []), ...(http.use ?? [])],
		});
		this.api = createOpenApiClient<Ops, Routes, Decoded>(
			client,
			operations,
			// `Decoding` already holds `decode` to `Decoded`.
			...([binding] as unknown as OpenApiArgs<Decoded>),
		);
	}

	/**
	 * The data of a call's 2xx reply. Any other reply, or none, throws a
	 * `DataSourceError`; an aborted call throws its abort, as it is.
	 */
	async data<R extends { readonly status: number; readonly data: unknown }>(
		call: Promise<R>,
	): Promise<Success<R>['data']> {
		try {
			return ok(await call);
		} catch (error) {
			if (isAbortError(error)) throw error;
			throw toDataSourceError(
				error,
				error instanceof UndeclaredStatusError
					? await bodyOf(error.response)
					: undefined,
			);
		}
	}
}

// `this.get(...)` for `this.api.get(...)`: getters on the prototype, so that a
// subclass's own `get()` or `delete()` still wins.
for (const method of METHODS) {
	Object.defineProperty(DataSource.prototype, method, {
		configurable: true,
		get(this: { readonly api: Record<string, unknown> }) {
			return this.api[method];
		},
	});
}

/**
 * A datasource for a service, typed by the `ClientOperations` generated from
 * its spec. It has the client's `get`, `post`… for each method the spec has
 * an operation for. Extend it with the calls a resolver makes:
 *
 * ```ts
 * class Bookmarks extends RESTDataSource<ClientOperations> {
 * 	bookmark(id: string) {
 * 		return this.data(this.get('/bookmarks/{id}', { param: { id } }));
 * 	}
 * }
 * new Bookmarks({ baseUrl, operations, token: () => context.token });
 * ```
 */
export type RESTDataSource<
	Ops extends OperationsShape<Ops>,
	Routes = RoutesOf<Ops>,
	Decoded extends boolean = false,
> = DataSource<Ops, Routes, Decoded> & PathMethods<Ops, Routes, Decoded>;

export const RESTDataSource = DataSource as unknown as new <
	Ops extends OperationsShape<Ops>,
	Routes = RoutesOf<Ops>,
	Decoded extends boolean = false,
>(
	options: RESTDataSourceOptions<Ops> & Decoding<Decoded>,
) => RESTDataSource<Ops, Routes, Decoded>;

/** A reply's body: JSON when it parses, its text otherwise, nothing when it cannot be read. */
async function bodyOf(response: Response): Promise<unknown> {
	const text = await response
		.clone()
		.text()
		.catch(() => undefined);
	if (!text) return undefined;
	try {
		return JSON.parse(text);
	} catch {
		return text;
	}
}
