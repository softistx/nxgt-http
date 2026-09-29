---
'@nxgt/typespec': minor
---

Check that each status has one reply. `@typespec/openapi3` merges two replies of one status without a warning: a reply without a body beside one with a body, such as `AuthenticationRequired` beside `Unauthorized`, is lost, and is now an error, `duplicate-status-reply`. Two replies with a body of one status code, such as `Conflict` beside `IdempotencyInProgress`, are merged under the first one's description, and now warned of, `merged-status-reply`. Plain body unions, bodies of different content types and `@error` models without a `@statusCode` still pass.
