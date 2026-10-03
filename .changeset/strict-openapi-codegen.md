---
"@nxgt/openapi-codegen": patch
---

Build and type-check under a stricter `tsconfig` — `exactOptionalPropertyTypes`, `noPropertyAccessFromIndexSignature`, `noImplicitReturns`, `noUnusedLocals` and the rest — so the published declarations compile under any of them in an application. Classes are now emitted with defined fields (`useDefineForClassFields`); no field's presence, order or value changes. `lint` and `loadDocument`'s `fs` take `undefined` as left out. The fields `buildIR` and `Resolver.deref` write as `undefined` when the spec has none are typed `| undefined`, as they are: `ApiIR`'s `title` and `apiVersion`, an operation's `summary`, `description` and `body`, a parameter's, a body's, a response's and a schema's `description`, a parameter's `deprecated`, a media type's `schema`, and `Resolved`'s `summary` and `description`. Redocly's `loadConfig` is called with no `configPath` key rather than an `undefined` one when no `redocly.yaml` is found, which it reads the same.
