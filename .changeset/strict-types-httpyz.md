---
"@nxgt/httpyz": patch
---

Compile under `exactOptionalPropertyTypes` and the rest of the stricter `tsconfig` an application may hold: `createHttpClient`'s `fetch` takes `undefined` as left out, so `fetch: options.fetch` type-checks there. A call's signal is handed to `new Request()` only when it has one, which `Request` reads as it read an `undefined` one.
