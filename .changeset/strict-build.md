---
"@nxgt/httpyz-query": patch
"@nxgt/openapi-hono": patch
"@nxgt/openapi-msw": patch
"@nxgt/openapi-nuxt": patch
---

Build and type-check under a stricter `tsconfig` — `exactOptionalPropertyTypes`, `noPropertyAccessFromIndexSignature`, `noImplicitReturns`, `noUnusedLocals` and the rest — so the published declarations compile under any of them in an application. Nothing a caller sees changes: `@nxgt/openapi-hono`'s validation middleware returns `undefined` explicitly after `next()`, `@nxgt/openapi-msw` hands `new Response()` a `statusText` and `headers` only when they are given, and the rest is bracket reads and internal types.
