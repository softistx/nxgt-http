---
'@nxgt/openapi-hono': minor
---

New package: the runtime the `hono.ts` that `@nxgt/openapi-codegen` generates binds to its spec, which was the `@nxgt/openapi-codegen/hono` subpath. Its API is unchanged: `createRoutes(app)` registers typed routes that validate the request, then call the handler, and `createApi()` adds `missing()` and `assertComplete()` across modules.
