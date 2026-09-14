---
'@nxgt/openapi-httpyz': minor
---

For a package built over the bound client, which types and reads its calls the way the client does:

- `api.operations` is the generated table the client was bound to, and a group's too.
- `PathsOf<Routes, Method>` and `IdOf<Ops, Routes, Method, Path>` are exported: the paths that have an operation for a method, and the `operationId` of the operation at a route.
