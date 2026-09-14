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

`@nxgt/httpyz` and `@tanstack/query-core` are peers: the queries use your
client, and TanStack's types. Every adapter depends on `@tanstack/query-core`,
so installing yours is enough.

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

## Queries

`queryOptions` takes a call as the client's `request` does: the method, the
path, then its options. The query resolves to the data of a 2xx reply, and
fails with the client's `ReplyStatusError` on any other:

```ts
import { useQuery } from '@tanstack/react-query';

const Employee = z.object({ id: z.int(), name: z.string() });

const { data } = useQuery({
	...queries.queryOptions('get', '/employees/{id}', {
		param: { id },
		responses: { 200: Employee, 404: Problem },
	}),
	enabled: id !== undefined,
});
data?.name; // Employee: the 404 is the query's error
```

The key is `[method, path, input]`, `input` holding what the call sends:
`param`, `query`, and its body. `decode: false` is in it too, since it changes
the data. It is tagged with the data, so `queryClient.getQueryData(key)` is
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
matches a filter's key as a prefix, so `queries.queryKey('get', '/employees/{id}')`
matches every query of that path, whatever its `param`.

## Traps

- **A binary body is not told apart in a key.** A `Blob` or a stream hashes
  as `{}`: give such a query a `queryKey` of your own after the spread.
- **A query throws on a declared error status.** Declare the statuses the
  API replies with; one it does not declare throws the client's
  `UndeclaredStatusError` before `ok` sees it.
- **Set `initialPageParam`'s type.** `null` alone types every page param as
  `null`: `null as string | null`.
