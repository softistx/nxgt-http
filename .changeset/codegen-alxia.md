---
"@nxgt/openapi-codegen": minor
---

Add the `alxia` option, which writes `alxia.ts`: each operation as the data an alxia app's `app.route(operation, handler)` takes — its method, its path written `/pets/:petId`, and its schemas with their concrete Zod types — and `operations`, all of them by `operationId`. The file imports only `zod` and `./zod`, plus `eventStream` from `@alxia/core` for a reply of server-sent events. The schemas read what alxia hands over: path parameters as strings, a query list given once as a list of one, headers lowercased, a body as JSON, a form or text. alxia answers a refused request with its own 400, so the 400 of `validationErrors` is not declared there. An operation alxia cannot route or validate yet (a `TRACE`, a parameter sharing its path segment, a binary body or reply, JSON Lines, named events) is left out with an `ignored` warning.
