---
'@nxgt/typespec': minor
---

Refuse two replies of one status with `duplicate-status-reply`. `@typespec/openapi3` merges them into one without a warning, and a reply without a body, such as `AuthenticationRequired` beside `Unauthorized`, is lost. Plain body unions and bodies of different content types still pass.
