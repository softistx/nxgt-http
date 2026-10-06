---
"@nxgt/openapi-msw": patch
---

Build and type-check under a stricter `tsconfig` — `exactOptionalPropertyTypes`, `noPropertyAccessFromIndexSignature`, `noImplicitReturns`, `noUnusedLocals` and the rest — so the published declarations compile under any of them in an application. Classes are now emitted with defined fields (`useDefineForClassFields`); no field's presence, order or value changes. `new Response()` is handed a `statusText` and `headers` only when they are given, which it reads the same.
