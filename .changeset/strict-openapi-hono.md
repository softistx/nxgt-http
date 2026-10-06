---
"@nxgt/openapi-hono": patch
---

Build and type-check under a stricter `tsconfig` — `exactOptionalPropertyTypes`, `noPropertyAccessFromIndexSignature`, `noImplicitReturns`, `noUnusedLocals` and the rest — so the published declarations compile under any of them in an application. Nothing a caller sees changes: the validation middleware returns `undefined` explicitly after `next()`, as it did implicitly.
