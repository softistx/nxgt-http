---
'@nxgt/openapi-codegen': minor
---

The generated `operations` table carries each operation's `ClientOperations` entry in its type, as `OperationSpec<ClientOperations[K]>`, so `createOpenApiClient(http, operations)` from `@nxgt/openapi-httpyz` is typed from the table alone. Nothing changes at runtime: `'~client'` is a type that is never set.
