---
'@nxgt/typespec': minor
---

Error aliases by verb, so an operation declares its usual errors in one name: `ListErrors` (`BadRequest`), `GetErrors` (`NotFound`), `CreateErrors` (`BadRequest | Conflict`), `UpdateErrors` (`BadRequest | NotFound | Conflict`), `DeleteErrors` (`NotFound`), and `AuthErrors` (`Unauthorized | Forbidden`). `get(@path id: uuid): User | GetErrors` emits what `User | NotFound` did.
