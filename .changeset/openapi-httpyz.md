---
'@nxgt/openapi-httpyz': minor
---

New package: the operations `@nxgt/openapi-codegen` generates, called through an `@nxgt/httpyz` client. `createOpenApiClient<ClientOperations, OperationsByRoute>(http, operations)` gives `api.op(id, input)` and `api.get(path, input)` for every method. The path, the parameters and the body are checked against the spec at compile time, and a call resolves to one of the declared replies, narrowed on its status.

`validate: true` checks the request before it is sent, as the routes `@nxgt/openapi-hono` generates from the same spec would, and the reply before it is returned, throwing a `ValidationError` with the issues the server would report. `decode: true`, on a client created with `createOpenApiClient<ClientOperations, OperationsByRoute, true>`, returns each reply as its schema outputs it: with `dates: 'date'`, a date-time is a `Date`.
