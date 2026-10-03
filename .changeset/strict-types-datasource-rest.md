---
"@nxgt/datasource-rest": patch
---

Compile under `exactOptionalPropertyTypes` and the rest of the stricter `tsconfig` an application may hold. A `Paginated`'s `data` and `metadata` take `undefined` as left out, so a page read through a generated client, whose optional fields are typed `T | undefined`, is a `Paginated` there too. `PageInfo`'s `startCursor` and `endCursor` are typed `string | undefined`, as `relayPaginate` writes them for a page without `metadata`. Types only.
