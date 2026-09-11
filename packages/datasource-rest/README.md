# @nxgt/datasource-rest

An Apollo-style REST datasource over `openapi-fetch`: auth forwarding, caching
and error translation, so a GraphQL resolver can call a REST service with the
same typed client the REST apps use.

## Install

```bash
bun add @nxgt/datasource-rest
```

Public on npmjs; no token needed to install. TypeScript is a peer, pinned to
`^6.0.3` across every `@nxgt/*` package — the set is unsatisfiable if one of
them widens it.

## Usage

```ts
import { RESTDataSource, errorToException } from '@nxgt/datasource-rest';
import createClient from '@nxgt/shared-hono/openapi-fetch';

const client = createClient<paths>({ baseUrl: env.BOOKMARKS_API_URL });

const bookmarks = new RESTDataSource({
	client,
	authOptions: { token: () => getAccessToken() },
	cacheOptions: { ttl: 5_000 },
});

const { data } = await bookmarks.get('/bookmarks/{id}', {
	params: { path: { id } },
});
```

`get` / `post` / `put` / `patch` / `delete` / `head` / `options` / `trace` are
the client's methods, rebound. Auth and cache are `openapi-fetch` middleware
installed in the constructor, cache first, then auth.

## Auth middleware

```ts
authOptions: {
	token: string | (() => Promise<string>),
	shouldUseToken?: (request: Request) => boolean,
}
```

The thunk is called per request. `shouldUseToken` skips the header on the
requests you name. No `token` means the middleware is a no-op.

## Cache middleware

In-process `Map`, keyed by `method:url`. Default TTL is five minutes. GET
(and any other non-POST) responses that are `ok` are stored. POST is cached
only when `shouldCachePostRequest` says so — the default is "the URL contains
`/search`".

This is a process cache, not Redis. Two instances of the datasource do not
share it.

## Errors

`errorToException(error, response)` maps HTTP status to `CustomException`:

| Status | `ErrorCode` |
| --- | --- |
| 401 | `Unauthenticated` |
| 403 | `Forbidden` |
| 404 | `NotFound` |
| 500 | `InternalServerError` |
| other | `BadRequest` |

A downstream 404 is `NotFound`, not a transport failure. Catch
`CustomException`, not an error named after the HTTP library.

`relayPaginate(data)` turns a REST `{ data, metadata }` page into a Relay
`{ edges, pageInfo }` connection, using `item.id` as the cursor.

## Things that bite

- **The cache is per process and unbounded except by TTL.** Do not point it at
  an endpoint that varies by caller unless `shouldUseToken` / the URL already
  distinguish them.
- **`authOptions.token` as a thunk is not awaited by the middleware today.**
  Pass a string, or a thunk that returns a string synchronously, until that
  is a real `async` `onRequest`.
