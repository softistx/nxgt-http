---
"@nxgt/httpyz": patch
---

Build and type-check under a stricter `tsconfig` — `exactOptionalPropertyTypes`, `noPropertyAccessFromIndexSignature`, `noImplicitReturns`, `noUnusedLocals` and the rest — so the published declarations compile under any of them in an application. Classes are now emitted with defined fields (`useDefineForClassFields`); no field's presence, order or value changes. `createHttpClient`'s `fetch` takes `undefined` as left out, so `fetch: options.fetch` type-checks there.
