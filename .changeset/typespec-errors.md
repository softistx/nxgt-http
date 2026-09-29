---
'@nxgt/typespec': minor
---

Add `@nxgt/typespec`, nxgt's HTTP conventions as a TypeSpec library, starting with the error replies: `ErrorBody<Status>`, the envelope `@nxgt/openapi-hono` sends (`status`, an i18n-key `message`, `timestamp`), and the responses `BadRequest` (with the validators' `issues`, optional), `Unauthorized`, `Forbidden`, `NotFound`, `Conflict`, `UnprocessableEntity`, `TooManyRequests`, `InternalServerError` and `ErrorResponse<Status>`.
