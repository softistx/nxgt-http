---
"@nxgt/datasource-rest": patch
---

Build and type-check under a stricter `tsconfig` — `exactOptionalPropertyTypes`, `noPropertyAccessFromIndexSignature`, `noImplicitReturns`, `noUnusedLocals` and the rest — so the published declarations compile under any of them in an application. Classes are now emitted with defined fields (`useDefineForClassFields`); no field's presence, order or value changes. A `Paginated`'s `data` and `metadata` take `undefined` as left out, so a page read through a generated client, whose optional fields are typed `T | undefined`, is a `Paginated` there too. `PageInfo`'s `startCursor` and `endCursor` are typed `string | undefined`, as `relayPaginate` writes them for a page without `metadata`.
