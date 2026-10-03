---
"@nxgt/openapi-nuxt": patch
---

Build and type-check under a stricter `tsconfig` — `exactOptionalPropertyTypes`, `noPropertyAccessFromIndexSignature`, `noImplicitReturns`, `noUnusedLocals` and the rest — so the published declarations compile under any of them in an application. Nothing a caller sees changes: only an internal type of the template that writes the client is widened.
