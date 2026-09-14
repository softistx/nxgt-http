---
'@nxgt/httpyz-query': minor
---

TanStack Query options for the calls of an `@nxgt/httpyz` client.

`createQueries(http)` gives `queryOptions`, `infiniteQueryOptions`, `mutationOptions` and `queryKey`. Each one returns a plain options object that any adapter takes. A query resolves to the data of a 2xx reply, and its call is sent with the query's `signal`, so a cancelled query aborts its request. Keys tell calls apart by what they send and are tagged with their data. An infinite query sends each page param as a query parameter.
