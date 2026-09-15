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
bun add -d @nxgt/openapi-codegen
```

`@nxgt/httpyz` and `@nxgt/openapi-httpyz` are peers. The generated
`operations.ts` imports `zod`, so the app needs it too. TypeScript is a peer,
`^6.0.3`, as in every `@nxgt/*` package.

## Usage

Generate the service's spec with `nxgt-openapi generate`, then extend the
datasource with the calls your resolvers make:

```ts
import { RESTDataSource } from '@nxgt/datasource-rest';
import { operations } from './generated/bookmarks/operations.js';
import type { ClientOperations } from './generated/bookmarks/types.js';

export class Bookmarks extends RESTDataSource<ClientOperations> {
	bookmark(id: string) {
		return this.data(this.get('/bookmarks/{id}', { param: { id } }));
	}
	search(q: string) {
		return this.data(this.query('/bookmarks', { json: { q } }));
	}
}

// Per request, in the GraphQL context:
const bookmarks = new Bookmarks({
	baseUrl: env.BOOKMARKS_API_URL,
	operations,
	token: () => request.token,
});
```

- **`this.get`, `this.post`, `this.query`…** call the operation at a path,
  typed by the spec. There is one for each method the spec has an operation
  for, and it offers only the paths that method has. Each call resolves to
  one of the declared replies, narrowed on its status.
- **`this.api`** is the bound client they come from, for `op(operationId)`,
  `stream()` and `group()`. The shorthands are getters on the class, so a
  subclass's own method of the same name wins.
- **`this.data(call)`** returns the data of a 2xx reply. Any other reply, or
  none, throws a `DataSourceError`.

| Option | |
| --- | --- |
| `baseUrl` | the service's base URL |
| `operations` | the generated `operations` table |
| `token` | sent as `Authorization: Bearer`; a function is read, and awaited, before each request |
| `cache` | default `defaultCache`, shared; your own `cache()` from `@nxgt/httpyz`; or `false` |
| `http` | what else the core client takes: `headers`, `timeout`, `retry`, `use`, `fetch` |
| `validate`, `decode` | as `createOpenApiClient` takes them |

## Cache

`defaultCache` is one store for every datasource, since a server makes them
per request. It is `cache()` from `@nxgt/httpyz`, with its defaults: it
keeps the `ok` replies of the reads, `GET`, `HEAD` and `QUERY`, for five
minutes. A search is a `QUERY`; a `POST` is never cached.

Its key is the method, the URL, the token and the body. So no caller is
answered with another's reply, and a search is cached by what it searches
for. It holds at most 500 replies, the least recently used going first.

`defaultCache.clear()` empties it, after a write, say. A cache of your own
takes `cache()`'s options:

```ts
import { cache } from '@nxgt/httpyz';

const bookmarksCache = cache({ ttl: 30_000 });
new Bookmarks({ baseUrl, operations, cache: bookmarksCache });
```

## Errors

`DataSourceError` is the package's own. It carries:

- `code`, from the reply's status;
- `status`, the reply's status, if one came back;
- `data`, the reply's body;
- `message`, the body's `message` when it has one;
- `extensions`, `{ code, status }`, which graphql-js reports with the error;
- `cause`, the client's own error.

| What happened | `code` |
| --- | --- |
| 401 | `UNAUTHENTICATED` |
| 403 | `FORBIDDEN` |
| 404 | `NOT_FOUND` |
| any 5xx | `INTERNAL_SERVER_ERROR` |
| any other status | `BAD_REQUEST` |
| no reply: network, timeout | `SERVICE_UNAVAILABLE` |
| a request `validate` refuses | `BAD_REQUEST` |
| a reply `validate` refuses | `INTERNAL_SERVER_ERROR` |

`toDataSourceError(error)` makes one out of whatever the client threw, for a
call you make without `this.data`. To map it onto your app's exceptions,
catch it where you throw yours.

## Pagination

`relayPaginate(page)` turns a service's `{ data, metadata }` page into a Relay
`{ edges, pageInfo }` connection, using `item.id` as the cursor:

```ts
async bookmarks(first: number) {
	return relayPaginate(
		await this.data(this.get('/bookmarks', { query: { first } })),
	);
}
```

## Things that bite

- **The cache is per process.** Two instances of a service do not share it.
- **An aborted call throws its abort**, not a `DataSourceError`: it was not
  the service failing.
- **`this.data` reads the body of an undeclared status** to find its message.
  A reply the spec declares is already read.
