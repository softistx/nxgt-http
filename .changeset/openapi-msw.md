---
'@nxgt/openapi-msw': minor
---

`@nxgt/openapi-msw` is a new package of MSW handlers for the operations `@nxgt/openapi-codegen` generates. `createOpenApiMsw(operations, { baseUrl })` binds the generated `operations` table, the same one `createOpenApiClient` takes, and infers every type from it.

- **Handlers typed by their operation.** `mock.get('/items/{id}', resolver)` and `mock.op('getItem', resolver)` return MSW handlers for `setupServer` or `setupWorker`. Only the spec's methods and paths compile.
- **The request as the server reads it.** The resolver receives `param`, `query` and `header` as the spec's validators output them, and the body as `json`, `form`, `text` or a binary `body`.
- **The server's 400.** A request the spec refuses is answered with the 400 that `@nxgt/openapi-hono` sends, with the same issues. Answer it your own way with `onValidationError`.
- **`reply(status, body)`.** The status comes first and types the body, so the editor offers the fields of the body declared for it. An undeclared status, or a body the spec does not declare, does not compile.
- **Mocks that drift fail.** A reply that does not match the spec at runtime throws a `MockReplyError` naming its issues, so the test fails instead of passing on a mock the spec no longer backs.
