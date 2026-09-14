---
'@nxgt/openapi-httpyz': minor
---

New package: the operations `@nxgt/openapi-codegen` generates, called through an `@nxgt/httpyz` client. `createOpenApiClient(http, operations)` gives `api.op(id, input)` and `api.get(path, input)` for each method the spec has an operation for, typed from the generated `operations` table alone. The path, the parameters and the body are checked against the spec at compile time, and a call resolves to one of the declared replies, narrowed on its status.

`validate: true` checks the request before it is sent, as the routes `@nxgt/openapi-hono` generates from the same spec would, and the reply before it is returned, throwing a `ValidationError` with the issues the server would report. `decode: true` returns each reply as its schema outputs it, and types it so: with `dates: 'date'`, a date-time is a `Date`.
