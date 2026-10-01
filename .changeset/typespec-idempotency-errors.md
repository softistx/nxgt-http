---
'@nxgt/typespec': patch
---

`IdempotencyInProgress` and `IdempotencyKeyReused` are declared in `lib/errors.tsp`, beside the library's other error replies, instead of `lib/headers.tsp`. Their names, namespace and emitted OpenAPI are unchanged.
