---
'@nxgt/openapi-nuxt': minor
---

TanStack Query for the bound client, with `query: true` in the module's options and `@tanstack/vue-query` and `@nxgt/httpyz-query` installed:

- `useApiQuery('get', '/items/{id}', { param: { id } })` is `useQuery` of an operation. Its input may hold refs, and the query follows them.
- `useApiMutation('post', '/items')` is `useMutation` of one. Its `mutate()` takes the operation's input.
- `useApiQueries()` gives the query options of `@nxgt/httpyz-query`, for `useQuery`, `useInfiniteQuery` or a query key to invalidate.

The module installs Vue Query: one `QueryClient` per request, and what SSR fetched goes to the browser in the payload, with a default `staleTime` of 5 s. `query: { plugin: false }` is for an app that installs its own. The new subpath `@nxgt/openapi-nuxt/query` holds what the module writes into the app.
