---
'@nxgt/typespec': minor
'@nxgt/openapi-codegen': minor
---

`@nxgt/typespec`: add `@queryMethod`, which marks a `@post` as an HTTP `QUERY`, a safe request with a body, until `@typespec/http` declares the method. It stays a `POST` on the wire and the document gets `x-nxgt-method: query`; `@operationIds` checks its verb as a `QUERY`'s, so `search` and `query` accept it; on anything but a `@post` it is the error `query-method-not-post`.

`@nxgt/openapi-codegen`: read `x-nxgt-method: query` on a `POST` as a `QUERY` sent as a `POST`: its entry in the generated `operations` table has `queryMethod: true`, typed `readonly queryMethod?: true` on `OperationSpec`. On another method, or with another value, it is ignored with the warning `ignored`.
