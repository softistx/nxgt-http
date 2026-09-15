---
'@nxgt/openapi-codegen': minor
'@nxgt/openapi-httpyz': patch
'@nxgt/openapi-hono': patch
---

- **`@nxgt/openapi-codegen`**: every operation that takes a parameter or a body now declares the 400 that `@nxgt/openapi-hono` answers a refused request with. Its body is `ValidationErrorBody`, `{ status: 400, message, timestamp, issues }`, with its validator `zValidationErrorBody`.
  - How it is declared:
    - on an operation without a 400, it is that 400;
    - on a 400 whose JSON media type has a schema, it is a union with that schema. The JSON media type is `application/json`, or the one a client reads an `application/json` reply as, such as `application/problem+json`;
    - on a 400 without a JSON media type, `application/json` is added to it.
  - Why: a client that decodes its replies, which `@nxgt/openapi-httpyz` now does by default, reads the refusal instead of throwing a `ValidationError`.
  - The new `validationErrors` option, `true` by default, turns this off with `false`, for an app whose `onValidationError` answers with a body of its own.
  - `withValidationErrors(ir, root)` and `VALIDATION_ERROR_BODY` are exported, for tools built on the pipeline.
- **`@nxgt/openapi-httpyz`**, **`@nxgt/openapi-hono`**: the READMEs say so.
