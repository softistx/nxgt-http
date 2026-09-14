---
'@nxgt/datasource-rest': major
---

`RESTDataSource` is now built over `@nxgt/openapi-httpyz`, not openapi-fetch, and depends on no exception package.

- **The client.** It takes `{ baseUrl, operations }`, the table `@nxgt/openapi-codegen` generates, and is typed by `ClientOperations`: `class Bookmarks extends RESTDataSource<ClientOperations>`. Calls go through `this.api`: `this.api.get('/bookmarks/{id}', { param: { id } })`. Only the methods the spec has an operation for are there. `this.data(call)` returns a 2xx reply's data and throws for any other.
- **The token.** `token` replaces `authOptions`, and a function is now awaited before each request; before, a promise was sent as the header. `shouldUseToken` is gone.
- **The cache.** `cache` replaces `cacheOptions`. By default it is `defaultCache`, shared by every datasource as before, and it keeps `GET`, `HEAD`, `QUERY` and a `POST` whose path holds `/search`. It is now keyed by the token and by a search's body, so no caller gets another's reply and two searches are no longer one. It no longer keeps `PUT`, `PATCH` or `DELETE` replies. It is bounded, `defaultCache.clear()` empties it, and `cache: false` turns it off.
- **Errors.** A failed call throws a `DataSourceError`, the package's own, with a `code` (`UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `BAD_REQUEST`, `INTERNAL_SERVER_ERROR`, `SERVICE_UNAVAILABLE`), the reply's `status` and `data`, and `extensions`, which a GraphQL server reports. `toDataSourceError` replaces `errorToException`, and `@nxgt/shared-exceptions` is no longer a dependency.
- **Peers.** `@nxgt/httpyz` and `@nxgt/openapi-httpyz` are now peers; `openapi-fetch` is gone.
- **Unchanged.** `relayPaginate` and the `Paginated`, `Connection`, `Edge` and `PageInfo` types stay as they were. The old `MediaType`, `HttpMethod`, `UpperHttpMethod` and `ErrorResponse` types are gone.
