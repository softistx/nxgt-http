---
'@nxgt/openapi-codegen': minor
---

Read a schema-valued `unevaluatedProperties` as `additionalProperties` where the two see the same keys: no `additionalProperties` beside it, and no `$ref`, `allOf`, `anyOf`, `oneOf`, `if`/`then`/`else` or `dependentSchemas`. It is how TypeSpec's `Record<T>` reaches OpenAPI 3.1, and it was refused with `unsupported_keyword`. Beside one of those keywords it is still refused, with a message that says so.
