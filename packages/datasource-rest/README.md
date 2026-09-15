# @nxgt/datasource-rest

A REST service, called from a GraphQL resolver or any server code, through
the client [`@nxgt/openapi-httpyz`](https://www.npmjs.com/package/@nxgt/openapi-httpyz)
binds to its spec. On top of that client it adds three things:

- it forwards the caller's token;
- it caches reads across the datasources of every request;
- it throws one `DataSourceError`, with a code a GraphQL server reports,
  whenever a call fails.

## Install

```bash
bun add @nxgt/datasource-rest @nxgt/httpyz @nxgt/openapi-httpyz zod
bun add -d @nxgt/openapi-codegen typescript
```

`@nxgt/httpyz` and `@nxgt/openapi-httpyz` are required peers. The generated
`operations.ts` imports `zod`, so the app needs it too. TypeScript is a peer,
`^6.0.3`, as in every `@nxgt/*` package. `@nxgt/openapi-codegen` generates
the spec's files, with `nxgt-openapi generate`.

## Usage

Extend the datasource with the calls your resolvers make, and make one per
request:

```ts
import { RESTDataSource } from '@nxgt/datasource-rest';
import { operations } from './generated/bookmarks/operations.js';

export class Bookmarks extends RESTDataSource.for(operations) {
	bookmark(id: string) {
		return this.data(this.get('/bookmarks/{id}', { param: { id } }));
	}
	search(q: string) {
		return this.data(this.query('/bookmarks', { json: { q } }));
	}
}

// Per request, in the GraphQL context:
const bookmarks = new Bookmarks({
	baseUrl: 'https://bookmarks.example.com',
	token: () => context.token,
});
```

- **`RESTDataSource.for(operations)`** is the class bound to the generated
  table, whose types it takes from it. The same without it:
  `extends RESTDataSource<ClientOperations>`, with `operations` passed to the
  constructor.
- **It validates and decodes by default**, as its client does: the request
  before it is sent, and each reply as its schema outputs it.
  `validate: false` and `decode: false` turn that off.
- **`this.get`, `this.post`, `this.query`…** call the operation at a path,
  typed by the spec. There is one for each method the spec has an operation
  for, and it offers only the paths that method has. Each call resolves to
  one of the declared replies, narrowed on its status.
- **`this.api`** is the bound client they come from, for `op(operationId)`,
  `stream()` and `group()`. The shorthands are set on each datasource, for
  the spec's methods only, so a subclass's own method of the same name wins.
- **`this.data(call)`** returns the data of a 2xx reply. Any other reply, or
  none, throws a `DataSourceError`.

Every option is in [the API](#restdatasource).

## Cache

`defaultCache` is one store for every datasource, since a server makes them
per request. It is `cache()` from `@nxgt/httpyz`, with its defaults: it
keeps the `ok` replies of the reads, `GET`, `HEAD` and `QUERY`, for five
minutes. A search is a `QUERY`; a `POST` is never cached.

Its key is the method, the URL, the `Authorization` header and the body. So
no caller is answered with another's reply, and a search is cached by what it
searches for. It holds at most 500 replies, the least recently used going
first.

`defaultCache.clear()` empties it, after a write, say. A cache of your own
takes `cache()`'s options; `cache: false` turns it off:

```ts
import { cache } from '@nxgt/httpyz';

const bookmarksCache = cache({ ttl: 30_000 });
new Bookmarks({ baseUrl, operations, cache: bookmarksCache });
```

## Errors

`this.data` throws a `DataSourceError`, the package's own. graphql-js reports
its `extensions`, `{ code, status }`, with the error a resolver throws.

| What happened | `code` |
| --- | --- |
| 401 | `UNAUTHENTICATED` |
| 403 | `FORBIDDEN` |
| 404 | `NOT_FOUND` |
| any 5xx | `INTERNAL_SERVER_ERROR` |
| any other status | `BAD_REQUEST` |
| no reply: network, timeout | `SERVICE_UNAVAILABLE` |
| a request `validate` refuses, with its `issues` | `BAD_REQUEST` |
| a reply `validate` or `decode` refuses, with its `issues` | `INTERNAL_SERVER_ERROR` |
| anything else thrown | `INTERNAL_SERVER_ERROR` |

Its message is the reply body's `message`, when it has a non-empty one. For
a call you make without `this.data`, `toDataSourceError` makes one out of
whatever the client threw. To map it onto your app's exceptions, catch it
where you throw yours:

```ts
import { DataSourceError } from '@nxgt/datasource-rest';

try {
	return await bookmarks.bookmark(id);
} catch (error) {
	if (error instanceof DataSourceError && error.code === 'NOT_FOUND') {
		return null;
	}
	throw error;
}
```

## Pagination

`relayPaginate(page)` turns a service's `{ data, metadata }` page into a Relay
`{ edges, pageInfo }` connection, using `item.id` as the cursor:

```ts
import { RESTDataSource, relayPaginate } from '@nxgt/datasource-rest';

export class Bookmarks extends RESTDataSource<ClientOperations> {
	async bookmarks(first: number) {
		return relayPaginate(
			await this.data(this.get('/bookmarks', { query: { first } })),
		);
	}
}
```

## API

### Classes

#### `RESTDataSource`

```ts
class RESTDataSource<
	Ops extends OperationsShape<Ops>, // ClientOperations, generated
	Routes = RoutesOf<Ops>,
	Decoded extends boolean = true,
> {
	constructor(options: RESTDataSourceOptions<Ops> & { decode?: Decoded });
	static for(operations: OperationTable<Ops>, options?: { decode?: boolean }): BoundDataSource<Ops, Decoded>;
	readonly api: OpenApiClient<Ops, Routes, Decoded>;
	data<R extends { readonly status: number; readonly data: unknown }>(
		call: Promise<R>,
	): Promise<Success<R>['data']>;
	// and PathMethods<Ops, Routes, Decoded>: get, post, query…
}
```

The class to extend, one per service; see [Usage](#usage). `RESTDataSource`
is both a constructor and a type, the datasource's own members and the
spec's path methods. With `Decoded` set to `false`, the options require
`decode: false`.

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `baseUrl` | `string` | required | The service's base URL. |
| `operations` | `OperationTable<Ops>` | required | The `operations` table generated from the service's spec. |
| `token` | `string \| null \| undefined \| (() => … \| Promise<…>)` | none | Sent as `Authorization: Bearer <token>`. A function is read, and awaited, before each request. None, or a nullish result, sends no header. |
| `cache` | `Cache \| false` | `defaultCache` | The replies cache: your own `cache()` from `@nxgt/httpyz`, or `false` for none. See [Cache](#cache). |
| `http` | `Omit<HttpClientOptions, 'baseUrl' \| 'auth'>` | `{}` | What else the core client takes: `headers`, `timeout`, `retry`, `use`, `fetch`… Its `use` runs inside the cache. |
| `validate` | `boolean \| { request?: boolean; response?: boolean }` | both | Checks the request and the reply with the spec's schemas, as `createOpenApiClient` does. `false`: neither. |
| `decode` | `Decoded` | `true` | Returns each reply as its schema outputs it. `false` returns it as JSON carries it. |

| Member | Type | Description |
| --- | --- | --- |
| `api` | `OpenApiClient<Ops, Routes, Decoded>` | The client bound to the spec, for `op()`, `stream()`, `group()` and `operations`. |
| `data(call)` | `Promise<Success<R>['data']>` | The data of `call`'s 2xx reply. Any other reply, or none, throws a `DataSourceError`; an abort is rethrown as it is. The body of a status the spec does not declare is read for its message. |
| `get`, `put`, `post`, `delete`, `options`, `head`, `patch`, `trace`, `query` | `PathMethods<Ops, Routes, Decoded>[M]` | `this.api[method]`, for the methods the spec has an operation for only, in the types and at runtime: `(path, ...args) => Promise<reply>`. Set on each datasource, so a subclass's method of the same name wins. |

#### `RESTDataSource.for`

```ts
RESTDataSource.for<Ops extends OperationsShape<Ops>>(operations: OperationTable<Ops>): BoundDataSource<Ops, true>;
RESTDataSource.for<Ops extends OperationsShape<Ops>>(
	operations: OperationTable<Ops>,
	options: { readonly decode: false },
): BoundDataSource<Ops, false>;
```

A datasource class bound to the generated `operations` table, which takes
its types from it: `class Bookmarks extends RESTDataSource.for(operations)`,
with no `ClientOperations` to import. Its constructor takes every option but
`operations`. With `{ decode: false }`, its replies are returned as JSON
carries them. See [Usage](#usage).

#### `DataSourceError`

```ts
class DataSourceError extends Error {
	constructor(message: string, options: DataSourceErrorOptions);
	readonly name: 'DataSourceError';
	readonly code: DataSourceErrorCode;
	readonly status: number | undefined;
	readonly data: unknown;
	readonly issues: readonly ValidationIssue[] | undefined;
	readonly extensions: {
		readonly code: DataSourceErrorCode;
		readonly status: number | undefined;
	};
}
```

Every way a call to a service fails; see [Errors](#errors). The constructor
passes `cause`, and any other `ErrorOptions`, on to `Error`.

| Property | Type | Description |
| --- | --- | --- |
| `name` | `'DataSourceError'` | |
| `message` | `string` | The reply body's `message`, or the client error's; `'An error occurred'` when what was thrown is not an `Error`. |
| `code` | `DataSourceErrorCode` | What failed, from the reply's status or the lack of one. |
| `status` | `number \| undefined` | The status of the service's reply; none when no reply came back. |
| `data` | `unknown` | The reply's body, as the service sent it; none when no reply was read. |
| `issues` | `readonly ValidationIssue[] \| undefined` | What a `validate` or `decode` check refused, in the request or the reply, as `@nxgt/httpyz` has them; none otherwise. |
| `extensions` | `{ code, status }` | What a GraphQL server reports with the error: graphql-js reads `extensions` off the error a resolver throws. |
| `cause` | `unknown` | What was thrown, when `toDataSourceError` made the error: the client's own error, or anything else. |

### Functions

#### `toDataSourceError`

```ts
function toDataSourceError(error: unknown, data?: unknown): DataSourceError;
```

`error` as a `DataSourceError`, whatever the client threw; a
`DataSourceError` is returned as it is. `data` is the body of a reply the
error does not carry, an `UndeclaredStatusError`'s, which only a read of its
response gives. It codes as the table in [Errors](#errors) says, and never
throws.

#### `codeOf`

```ts
function codeOf(status: number): DataSourceErrorCode;
```

The code of a reply's status: 401, 403 and 404 by name, any 5xx
`INTERNAL_SERVER_ERROR`, any other `BAD_REQUEST`.

#### `relayPaginate`

```ts
function relayPaginate<T extends { id: string }>(
	page: Paginated<T>,
): Connection<T>;
```

A service's page as a Relay connection: each item an edge, its `id` the
cursor, `metadata` the `pageInfo`. A page without `data` has no edges; one
without `metadata` gets the `pageInfo` of an empty last page,
`{ hasNextPage: false, totalElements: 0 }`, even when it has items. See
[Pagination](#pagination).

### Constants

#### `defaultCache`

```ts
const defaultCache: Cache; // Middleware & { clear(): void }
```

`cache()` from `@nxgt/httpyz` with its defaults, shared by every datasource
not given its own `cache`. `defaultCache.clear()` empties it. See
[Cache](#cache).

### Types

#### `RESTDataSourceOptions`

```ts
interface RESTDataSourceOptions<Ops> extends OpenApiOptions {
	baseUrl: string;
	operations: OperationTable<Ops>;
	token?: Token | (() => Token | Promise<Token>); // Token: string | null | undefined
	cache?: Cache | false;
	http?: Omit<HttpClientOptions, 'baseUrl' | 'auth'>;
}
```

What the `RESTDataSource` constructor takes, with `decode`; each option is in
[its table](#restdatasource).

#### `BoundDataSource`

```ts
type BoundDataSource<Ops extends OperationsShape<Ops>, Decoded extends boolean = true> = new (
	options: Omit<RESTDataSourceOptions<Ops>, 'operations'>,
) => RESTDataSource<Ops, RoutesOf<Ops>, Decoded>;
```

What [`RESTDataSource.for`](#restdatasourcefor) returns: a datasource class
bound to its table, to extend.

#### `DataSourceErrorCode`

```ts
type DataSourceErrorCode =
	| 'BAD_REQUEST'
	| 'UNAUTHENTICATED'
	| 'FORBIDDEN'
	| 'NOT_FOUND'
	| 'INTERNAL_SERVER_ERROR'
	| 'SERVICE_UNAVAILABLE';
```

A `DataSourceError`'s `code`, and what `codeOf` returns.

#### `DataSourceErrorOptions`

```ts
interface DataSourceErrorOptions extends ErrorOptions {
	readonly code: DataSourceErrorCode;
	readonly status?: number | undefined;
	readonly data?: unknown;
	readonly issues?: readonly ValidationIssue[] | undefined;
}
```

The second argument of `new DataSourceError()`.

#### `Paginated`

| Field | Type | Description |
| --- | --- | --- |
| `data` | `T[]`, optional | The page's items. |
| `metadata` | `PageInfo`, optional | Where the page stands. |

A page as a service sends it: what `relayPaginate` takes.

#### `Connection`

| Field | Type | Description |
| --- | --- | --- |
| `edges` | `Edge<T>[]` | One per item. |
| `pageInfo` | `PageInfo` | Where the page stands. |

The Relay connection `relayPaginate` returns.

#### `Edge`

| Field | Type | Description |
| --- | --- | --- |
| `node` | `T` | The item. |
| `cursor` | `string` | The item's `id`. |

An item of a `Connection`.

#### `PageInfo`

| Field | Type | Description |
| --- | --- | --- |
| `startCursor` | `string`, optional | The cursor of the first item in the result set. |
| `endCursor` | `string`, optional | The cursor of the last item in the result set. |
| `hasNextPage` | `boolean` | Whether there are more items after the current page. |
| `totalElements` | `number` | The number of items across all pages. |

A `Paginated`'s `metadata`, and a `Connection`'s `pageInfo`, as it is.

## Traps

- **The cache is per process.** Two instances of a service do not share it,
  so each may answer from its own for up to five minutes: give reads that must
  be fresh `cache: false`, or a `cache({ ttl })` of your own.
- **A write does not empty the cache.** A read made after it may be answered
  from memory: call `defaultCache.clear()` after the write.
- **An aborted call throws its abort**, not a `DataSourceError`: it was not
  the service failing. Tell it apart with `isAbortError(error)` from
  `@nxgt/httpyz`.
- **`this.data` reads the body of an undeclared status** to find its message.
  A reply the spec declares is already read; declare the error statuses the
  service replies with.
