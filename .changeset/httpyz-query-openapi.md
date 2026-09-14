---
'@nxgt/httpyz-query': minor
---

`@nxgt/httpyz-query/openapi`: TanStack Query options for the operations of an `@nxgt/openapi-httpyz` bound client.

`createOpenApiQueries(api, operations)` takes a call as the bound client does, by method and path, and returns `queryOptions`, `infiniteQueryOptions`, `mutationOptions` and `queryKey`. A key holds the operation's input and never its init. `pageParamName` must be one of the operation's query parameters. A decoding client's queries resolve to what its schemas output. `@nxgt/openapi-httpyz` is an optional peer.
