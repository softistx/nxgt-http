---
"@nxgt/openapi-codegen": patch
---

Compile under `exactOptionalPropertyTypes` and the rest of the stricter `tsconfig` an application may hold. `lint` takes `undefined` as left out. The IR's optional fields that `buildIR` writes as `undefined` when the spec has none — `ApiIR`'s `title` and `apiVersion`, an operation's `summary`, `description` and `body`, a parameter's, a body's, a response's and a schema's `description`, a parameter's `deprecated`, a media type's `schema` — are typed `| undefined`, as they are. Redocly's `loadConfig` is called with no `configPath` key rather than an `undefined` one, when no `redocly.yaml` is found. Types only, otherwise.
