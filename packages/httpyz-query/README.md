# @nxgt/httpyz-query

[TanStack Query](https://tanstack.com/query) options for the calls of an
[`@nxgt/httpyz`](https://www.npmjs.com/package/@nxgt/httpyz) client. Each
function returns a plain options object, with a key that tells calls apart by
what they send, and a `queryFn` that sends the call with the query's
`signal`: a query TanStack cancels aborts its request.

It adds no runtime of TanStack's, so any adapter takes the objects:
`useQuery` in React or Vue, `createQuery` in Solid or Svelte, `injectQuery`
in Angular.

> **0.x.** The API is still settling.

## Install

```sh
bun add @nxgt/httpyz @nxgt/httpyz-query @tanstack/react-query
```

| Peer | | |
| --- | --- | --- |
| `@nxgt/httpyz` | required | the client whose calls the queries send |
| `@tanstack/query-core` | required | TanStack's types. Every adapter depends on it, so installing yours is enough |
| `typescript` | required | `^6.0.3` |
| `@nxgt/openapi-httpyz` | optional | only for [`@nxgt/httpyz-query/openapi`](#with-an-openapi-spec) |

## Setup

```ts
import { createHttpClient } from '@nxgt/httpyz';
import { createQueries } from '@nxgt/httpyz-query';

export const http = createHttpClient({ baseUrl: 'https://api.example.com' });
export const queries = createQueries(http);
```

| Option | Default | |
| --- | --- | --- |
| `scope` | none | put first in every key: two clients whose paths are the same keep their queries apart |

## Subpaths

| Import | What it has |
| --- | --- |
| `@nxgt/httpyz-query` | `createQueries`, for a client of `createHttpClient`, and the types |
| `@nxgt/httpyz-query/openapi` | `createOpenApiQueries`, for a client bound to a spec by `@nxgt/openapi-httpyz` |

## Queries

`queryOptions` takes a call as the client's `request` does: the method, the
path, then its options. The query resolves to the data of a 2xx reply, and
fails with the client's `ReplyStatusError` on any other:

```ts
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { queries } from './queries';

const Employee = z.object({ id: z.int(), name: z.string() });
const Problem = z.object({ title: z.string() });

const { data } = useQuery({
	...queries.queryOptions('get', '/employees/{id}', {
		param: { id },
		responses: { 200: Employee, 404: Problem },
	}),
	enabled: id !== undefined,
});
data?.name; // Employee: the 404 is the query's error
```

The key is `[method, path, input]`, after the `scope` when there is one.
`input` holds what the call sends, `param`, `query`, `header` and its body, and
`decode: false`, since that changes the data; it is left out when empty. The
call options, `headers`, `timeout`, `signal`, are never in it. The key is
tagged with the data, so `queryClient.getQueryData(options.queryKey)` is
typed.

## Cancelling

TanStack aborts a query's `signal` when the query is cancelled, and when its
last observer unmounts while it still runs. The call is sent with that
signal, so it is aborted too: its request stops, not only its result. A
`signal` in the call's own options still ends it, as does its `latest`.

```ts
await queryClient.cancelQueries({ queryKey: queries.queryKey('get', '/search') });
```

## Infinite queries

`infiniteQueryOptions` takes the call's options, then how it pages:
TanStack's own `initialPageParam` and `getNextPageParam`, and
`pageParamName`, the query parameter each page's param is sent as. A `null`
page param is left out, so the first page goes without it:

```ts
import { useInfiniteQuery } from '@tanstack/react-query';

const { data, fetchNextPage } = useInfiniteQuery(
	queries.infiniteQueryOptions(
		'post',
		'/employees/search',
		{ json: { sort }, query: { first: 20 }, responses: { 200: EmployeePage } },
		{
			pageParamName: 'after',
			initialPageParam: null as string | null,
			getNextPageParam: (last) => last.cursor,
		},
	),
);
```

Its key ends with `'infinite'`, apart from the plain query of the same call,
whose data is one page rather than all of them.

## Mutations

`mutationOptions` takes the method and the path, and what every call shares,
such as `responses`. Its `mutate()` takes what each call sends:

```ts
import { useMutation } from '@tanstack/react-query';

const remove = useMutation({
	...queries.mutationOptions('delete', '/employees/{id}', {
		responses: { 204: null },
	}),
	onSuccess: () =>
		queryClient.invalidateQueries({ queryKey: queries.queryKey('get', '/employees') }),
});
remove.mutate({ param: { id } });
```

`mutate()` takes nothing when the path has no `{name}`s to fill.

## Keys and filters

`queryKey(method, path?, input?)` is a key, or the start of one: TanStack
matches a filter's key as a prefix, so every query of a path matches,
whatever its `param`:

```ts
queryClient.invalidateQueries({ queryKey: queries.queryKey('get', '/employees/{id}') });
queryClient.removeQueries({ queryKey: queries.queryKey('get') }); // every GET
```

## With an OpenAPI spec

`@nxgt/httpyz-query/openapi` does the same for a client bound to a
generated spec by
[`@nxgt/openapi-httpyz`](https://www.npmjs.com/package/@nxgt/openapi-httpyz),
an optional peer. It takes the bound client, and reads the spec from the
`operations` the client was bound to, as the client does:

```ts
import { createOpenApiQueries } from '@nxgt/httpyz-query/openapi';
import { api } from './api'; // createOpenApiClient(http, operations)

export const queries = createOpenApiQueries(api);

// As api.get() takes it: the path, the input, then the init
useQuery(queries.queryOptions('get', '/employees/{id}', { param: { id } }));
useQuery(queries.queryOptions('get', '/health'));

useInfiniteQuery(
	queries.infiniteQueryOptions(
		'post',
		'/employees/search',
		{ json: { sort }, query: { first: 20 } },
		{
			pageParamName: 'after',
			initialPageParam: null as string | null,
			getNextPageParam: (last) => last.cursor,
		},
	),
);

const remove = useMutation(queries.mutationOptions('delete', '/employees/{id}'));
remove.mutate({ param: { id } });
```

- Every call is typed by the spec, as the bound client's are: the method, one
  the spec has an operation for, the path, the input, and the data, a 2xx
  reply's, decoded when the client decodes.
- The key holds the input, header parameters included, and never the init.
- `pageParamName` is one of the operation's query parameters.
- `mutate()` takes the operation's input; `mutationOptions`' third argument
  is the init every call shares, or a function of the input that returns
  each call's own: TanStack gives a mutation no signal, so this is where one
  goes.

Coming from `openapi-react-query`: `$api.queryOptions('get', path, { params:
{ path, query }, body })` becomes `queries.queryOptions('get', path, { param,
query, json })`, and `$api.useQuery(...)` becomes
`useQuery(queries.queryOptions(...))`.

## API

### `@nxgt/httpyz-query`

#### Functions

##### `createQueries`

```ts
function createQueries(http: HttpClient, options?: QueriesOptions): HttpQueries;
```

The options objects for the calls of `http`, a client of `createHttpClient`.
Its calls go through `http.request`, so the client's middleware, retries and
timeouts apply. See [Setup](#setup).

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `http` | `HttpClient` | | the client whose calls the queries send |
| `options.scope` | `string` | none | put first in every key |

Returns an [`HttpQueries`](#httpqueries). Throws nothing.

#### The queries object

##### `queryOptions`

```ts
queryOptions<Path extends string, R extends Responses | undefined = undefined, Decoded extends boolean = true>(
	method: Method,
	path: Path,
	...args: RequestArgs<Path, R, Decoded> // [options?], or [options] when the path has {name}s
): HttpQueryOptions<QueryData<R, Decoded>>;
```

The options of a query of one call. See [Queries](#queries).

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `method` | `Method` | | `'get'`, `'post'`, `'query'`… |
| `path` | `Path` | | the path, `{name}`s unfilled: `'/employees/{id}'` |
| `options` | `RequestOptions<Path, R, Decoded>` | | what the client's `request` takes: `param`, `query`, a body, `responses`, `decode`, and call options such as `signal` or `latest`. Required when the path has `{name}`s |

| Field | Type | Description |
| --- | --- | --- |
| `queryKey` | `HttpQueryKey<Data>` | `[scope?, method, path, input?]`, tagged with the data |
| `queryFn` | `({ signal }) => Promise<Data>` | sends the call with the query's `signal`, joined with the options' own |

The `queryFn` resolves to the data of a 2xx reply, and rejects with a
`ReplyStatusError` on any other, or with whatever the call throws:
`UndeclaredStatusError`, `ValidationError`, `TimeoutError`, an abort.

##### `infiniteQueryOptions`

```ts
infiniteQueryOptions<Path extends string, PageParam, R extends Responses | undefined = undefined, Decoded extends boolean = true>(
	method: Method,
	path: Path,
	options: RequestOptions<Path, R, Decoded>,
	paging: Paging<QueryData<R, Decoded>, PageParam>,
): HttpInfiniteQueryOptions<QueryData<R, Decoded>, PageParam>;
```

The options of an infinite query: each page is the call sent with its
`pageParam` as the query parameter `pageParamName`, left out when `null` or
`undefined`. See [Infinite queries](#infinite-queries).

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `method` | `Method` | | as `queryOptions` |
| `path` | `Path` | | as `queryOptions` |
| `options` | `RequestOptions<Path, R, Decoded>` | | as `queryOptions`, always given. Its `query` may be an object or a `URLSearchParams` |
| `paging` | [`Paging`](#paging) | | `pageParamName`, and TanStack's paging options |

| Field | Type | Description |
| --- | --- | --- |
| `queryKey` | `HttpQueryKey<InfiniteData<Data, PageParam>>` | the call's key, then `'infinite'` |
| `queryFn` | `({ signal, pageParam }) => Promise<Data>` | sends one page |
| `initialPageParam` | `PageParam` | from `paging` |
| `getNextPageParam` | `GetNextPageParamFunction<PageParam, Data>` | from `paging` |
| `getPreviousPageParam` | `GetPreviousPageParamFunction<PageParam, Data>` | from `paging`, when given |
| `maxPages` | `number` | from `paging`, when given |

Each page rejects as a `queryOptions` query does.

##### `mutationOptions`

```ts
mutationOptions<Path extends string, R extends Responses | undefined = undefined, Decoded extends boolean = true>(
	method: Method,
	path: Path,
	options?: CallOptions & ReplyOptions<R, Decoded>,
): HttpMutationOptions<Path, QueryData<R, Decoded>>;
```

The options of a mutation of one call, whose `mutate()` takes what each call
sends. See [Mutations](#mutations).

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `method` | `Method` | | as `queryOptions` |
| `path` | `Path` | | as `queryOptions` |
| `options` | `CallOptions & ReplyOptions<R, Decoded>` | none | what every call shares: `responses`, `validate`, `decode`, `headers`, `timeout`… |

| Field | Type | Description |
| --- | --- | --- |
| `mutationKey` | `readonly unknown[]` | `[scope?, method, path]` |
| `mutationFn` | `(variables: MutationVariables<Path>) => Promise<Data>` | sends the call with `options`, then `variables` over them. `variables` may be left out when the path has no `{name}`s |

The `mutationFn` rejects as a `queryOptions` query does. It is sent with no
signal of TanStack's: a mutation is not cancelled.

##### `queryKey`

```ts
queryKey(method: Method, path?: string, input?: KeyInput): readonly unknown[];
```

A key, or the start of one, for a filter: `[scope?, method, path?, input?]`,
built as the options' keys are. It is not tagged with any data. See
[Keys and filters](#keys-and-filters).

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `method` | `Method` | | the method |
| `path` | `string` | none | the path, `{name}`s unfilled |
| `input` | [`KeyInput`](#keyinput) | none | what the calls send: `param`, `query`, `header`, a body; `decode: false` |

#### Types

##### `HttpQueries`

What `createQueries` returns: [`queryOptions`](#queryoptions),
[`infiniteQueryOptions`](#infinitequeryoptions),
[`mutationOptions`](#mutationoptions) and [`queryKey`](#querykey).

##### `QueriesOptions`

| Field | Type | Description |
| --- | --- | --- |
| `scope` | `string` | optional: put first in every key, `'catalog'` |

The second argument of `createQueries` and `createOpenApiQueries`.

##### `HttpQueryOptions`

```ts
interface HttpQueryOptions<Data> {
	readonly queryKey: HttpQueryKey<Data>;
	readonly queryFn: (context: { readonly signal: AbortSignal }) => Promise<Data>;
}
```

What `queryOptions` returns, in both entry points.

##### `HttpInfiniteQueryOptions`

```ts
interface HttpInfiniteQueryOptions<Data, PageParam> extends Omit<Paging<Data, PageParam>, 'pageParamName'> {
	readonly queryKey: HttpQueryKey<InfiniteData<Data, PageParam>>;
	readonly queryFn: (context: { readonly signal: AbortSignal; readonly pageParam: PageParam }) => Promise<Data>;
}
```

What `infiniteQueryOptions` returns, in both entry points.

##### `HttpMutationOptions`

```ts
interface HttpMutationOptions<Path extends string, Data> {
	readonly mutationKey: readonly unknown[];
	// MutationVariables<Path> | void when the path has no {name}s
	readonly mutationFn: (variables: MutationVariables<Path>) => Promise<Data>;
}
```

What `mutationOptions` of `createQueries` returns.

##### `Paging`

| Field | Type | Description |
| --- | --- | --- |
| `pageParamName` | `string` | the query parameter each page's `pageParam` is sent as: `'after'`, `'page'` |
| `initialPageParam` | `PageParam` | the first page's param |
| `getNextPageParam` | `GetNextPageParamFunction<PageParam, Data>` | the next page's param, from the last page |
| `getPreviousPageParam` | `GetPreviousPageParamFunction<PageParam, Data>` | optional: the previous page's param |
| `maxPages` | `number` | optional: how many pages TanStack keeps |

The fourth argument of `infiniteQueryOptions`. In `./openapi`,
`pageParamName` is narrowed to the operation's query parameters.

##### `KeyInput`

| Field | Type | Description |
| --- | --- | --- |
| `param` | `{ readonly [name: string]: unknown }` | the path's parameters |
| `query` | `QueryInput` | the query: an object, or a `URLSearchParams` |
| `header` | `{ readonly [name: string]: unknown }` | header parameters, an operation's input's |
| `json` | `unknown` | a JSON body |
| `form` | `unknown` | a form body |
| `text` | `string` | a text body |
| `body` | `unknown` | a raw body |
| `decode` | `false` | the calls that do not decode, whose keys hold it |

What `queryKey` takes as its `input`, every field optional.

##### `HttpQueryKey`

A key tagged with its data, `DataTag<readonly unknown[], Data>`, which is
what types `queryClient.getQueryData(key)`.

```ts
const key: HttpQueryKey<Employee> = queries.queryOptions('get', '/employees/{id}', options).queryKey;
```

##### `QueryData`

The data of a call's 2xx replies, from its `responses` and whether it
decodes.

```ts
type Data = QueryData<{ 200: typeof Employee; 404: typeof Problem }, true>; // z.output<typeof Employee>
```

##### `MutationVariables`

What `mutate()` takes: what the call to `Path` sends, `RequestInput<Path>`,
and its `CallOptions`.

```ts
type Variables = MutationVariables<'/employees/{id}'>; // { param: { id }, query?, json?… } & CallOptions
```

### `@nxgt/httpyz-query/openapi`

#### Functions

##### `createOpenApiQueries`

```ts
function createOpenApiQueries<Ops extends OperationsShape<Ops>, Routes, Decoded extends boolean>(
	api: OpenApiClient<Ops, Routes, Decoded>,
	options?: QueriesOptions,
): OpenApiQueries<Ops, Routes, Decoded>;
```

The options objects for the operations of `api`, a client of
`createOpenApiClient`, whose types it infers. It reads `api.operations` to
tell an operation's input from its init, as the client does: an operation
that takes nothing is called with its init alone. The calls are the client's
own, `api.get(path, …)` and the other methods. See
[With an OpenAPI spec](#with-an-openapi-spec).

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `api` | `OpenApiClient<Ops, Routes, Decoded>` | | the bound client |
| `options.scope` | `string` | none | put first in every key |

Returns an [`OpenApiQueries`](#openapiqueries). Throws nothing itself; its
members throw an `Error`, `The spec has no GET /x operation`, for a method
and path the spec has no operation at, which the types already refuse.

#### The queries object

##### `queryOptions`

```ts
queryOptions<M extends MethodsOf<Routes>, P extends PathsOf<Routes, M>>(
	method: M,
	path: P,
	...args: Args<Ops, IdOf<Ops, Routes, M, P>> // [input, init?], or [init?] for an operation that takes nothing
): HttpQueryOptions<OperationData<Ops, IdOf<Ops, Routes, M, P>, Decoded>>;
```

The options of a query of the operation at `method` and `path`, taking what
`api[method](path, …)` takes.

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `method` | `MethodsOf<Routes>` | | a method the spec has an operation for |
| `path` | `PathsOf<Routes, M>` | | a path with an operation for that method |
| `input` | the operation's input | | `param`, `query`, `header`, a body. Absent for an operation that takes nothing |
| `init` | `OperationInit` | none | the core client's call options: `signal`, `timeout`, `headers`, `latest`… |

| Field | Type | Description |
| --- | --- | --- |
| `queryKey` | `HttpQueryKey<Data>` | `[scope?, method, path, input?]`: the input, never the init |
| `queryFn` | `({ signal }) => Promise<Data>` | calls the operation with the query's `signal`, joined with the init's own |

The `queryFn` resolves to the data of a 2xx reply, and rejects with a
`ReplyStatusError` on any other, or with whatever the call throws.
`queryOptions` throws at once for an operation the spec does not have.

##### `infiniteQueryOptions`

```ts
infiniteQueryOptions<M extends MethodsOf<Routes>, P extends PathsOf<Routes, M>, PageParam>(
	method: M,
	path: P,
	input: Ops[IdOf<Ops, Routes, M, P>]['args'][0],
	paging: Omit<Paging<Data, PageParam>, 'pageParamName'> & { readonly pageParamName: QueryNames<Input> },
	init?: OperationInit,
): HttpInfiniteQueryOptions<Data, PageParam>;
// Input: Ops[IdOf<Ops, Routes, M, P>]['args'][0]; Data: OperationData<Ops, IdOf<Ops, Routes, M, P>, Decoded>
```

The options of an infinite query of an operation, each page sent with its
`pageParam` as one of the operation's query parameters.

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `method` | `MethodsOf<Routes>` | | as `queryOptions` |
| `path` | `PathsOf<Routes, M>` | | as `queryOptions` |
| `input` | the operation's input | | as `queryOptions`, always given |
| `paging` | [`Paging`](#paging) | | `pageParamName` is one of the input's query parameters |
| `init` | `OperationInit` | none | the call options every page is sent with |

Returns the fields of [`infiniteQueryOptions`](#infinitequeryoptions) above.
`infiniteQueryOptions` throws at once for an operation the spec does not
have.

##### `mutationOptions`

```ts
mutationOptions<M extends MethodsOf<Routes>, P extends PathsOf<Routes, M>>(
	method: M,
	path: P,
	init?: MutationInit<OperationVariables<Ops[IdOf<Ops, Routes, M, P>]['args']>>,
): OpenApiMutationOptions<
	OperationVariables<Ops[IdOf<Ops, Routes, M, P>]['args']>,
	OperationData<Ops, IdOf<Ops, Routes, M, P>, Decoded>
>;
```

The options of a mutation of an operation, whose `mutate()` takes its input.

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `method` | `MethodsOf<Routes>` | | as `queryOptions` |
| `path` | `PathsOf<Routes, M>` | | as `queryOptions` |
| `init` | [`MutationInit`](#mutationinit) | none | the call options every call shares, or a function of `mutate()`'s input that returns each call's |

| Field | Type | Description |
| --- | --- | --- |
| `mutationKey` | `readonly unknown[]` | `[scope?, method, path]` |
| `mutationFn` | `(variables: OperationVariables<Args>) => Promise<Data>` | calls the operation with `variables` as its input, and `init`, or what `init(variables)` returns |

The `mutationFn` rejects as a query does. TanStack gives a mutation no
signal; a function `init` gives each call its own:

```ts
const save = useMutation(
	queries.mutationOptions('put', '/employees/{id}', (input) => ({
		latest: `save ${input.param.id}`, // a second save of the same employee aborts the first
	})),
);
```

`mutationOptions` throws at once for an operation the spec does not have.

##### `queryKey`

```ts
queryKey(method: Method, path?: string, input?: KeyInput): readonly unknown[];
```

As [`queryKey`](#querykey) of `createQueries`: any method and path, untyped
by the spec.

#### Types

`QueriesOptions`, `HttpQueryKey`, `HttpQueryOptions`,
`HttpInfiniteQueryOptions`, `Paging` and `KeyInput`, documented above, are
exported from `@nxgt/httpyz-query/openapi` too: one import is enough.

##### `OpenApiQueries`

What `createOpenApiQueries` returns: [`queryOptions`](#queryoptions-1),
[`infiniteQueryOptions`](#infinitequeryoptions-1),
[`mutationOptions`](#mutationoptions-1) and [`queryKey`](#querykey-1), typed
by the client's `Ops`, `Routes` and `Decoded`.

##### `OpenApiMutationOptions`

```ts
interface OpenApiMutationOptions<Variables, Data> {
	readonly mutationKey: readonly unknown[];
	readonly mutationFn: (variables: Variables) => Promise<Data>;
}
```

What `mutationOptions` of `createOpenApiQueries` returns.

##### `MutationInit`

```ts
type MutationInit<Variables> =
	| OperationInit
	| ((variables: Variables) => OperationInit | undefined);
```

The third argument of `mutationOptions`: the init every call shares, or a
function of `mutate()`'s input that returns each call's own.

##### `OperationData`

The data of an operation's 2xx replies, decoded when `Decoded` is `true`.

```ts
type Employee = OperationData<ClientOperations, 'getEmployee', false>;
```

##### `OperationVariables`

What `mutate()` takes, from an operation's arguments: `void` when it takes
nothing, its input, or its input or nothing when none of it is required.

```ts
type Variables = OperationVariables<ClientOperations['deleteEmployee']['args']>; // { param: { id: number } }
```

##### `QueryNames`

The names of the query parameters of an operation's input: what
`pageParamName` may be.

```ts
type Names = QueryNames<{ query?: { first?: number; after?: string } }>; // 'first' | 'after'
```

## Traps

- **A binary body is not told apart in a key.** A `Blob` or a stream hashes
  as `{}`: give such a query a `queryKey` of your own after the spread.
- **A status the call does not declare fails differently.** A declared
  non-2xx reply fails the query with a `ReplyStatusError`, but one missing
  from `responses` throws the client's `UndeclaredStatusError` first: declare
  every status the API replies with.
- **`queryKey()` is not tagged.** `queryClient.getQueryData(queries.queryKey(...))`
  is `unknown`: read the cache with the options' own `queryKey`.
- **Set `initialPageParam`'s type.** `null` alone types every page param as
  `null`: `null as string | null`.
