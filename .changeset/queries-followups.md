---
'@nxgt/httpyz': minor
'@nxgt/httpyz-query': minor
---

- **`@nxgt/httpyz`**:
  - The `fetch` option may return a `Response` at once, as well as a promise of one: `fetch: app.fetch` takes a Hono app as it is, with no `async` wrapper.
  - In `responses`, a status declared with an empty media map, `{}`, types as `null` does: a reply without a body, instead of `never`.
- **`@nxgt/httpyz-query`**:
  - `queryKey()`'s input takes `header` and `decode: false`, as the keys already hold them, so a filter can name them.
  - In `./openapi`, `mutationOptions(method, path, init)` also takes a function of `mutate()`'s input that returns each call's init: its own `signal`, `latest` or headers.
  - `infiniteQueryOptions` throws at once for an operation the spec does not have, as `queryOptions` and `mutationOptions` do.
  - `./openapi` also exports `KeyInput`, `Paging`, `QueriesOptions`, `HttpQueryKey`, `HttpQueryOptions` and `HttpInfiniteQueryOptions`, and the new `MutationInit`.
