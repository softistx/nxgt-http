---
'@nxgt/openapi-hono': minor
'@nxgt/openapi-codegen': minor
---

`c.env` is typed in the handlers of `routes`: `createRoutes(app)` and `createApi().routes(app)` take the app's `Env` from its `Hono<E>`, so a handler reads `c.env.db` as the app declares it. Regenerate `hono.ts` to get it. `Routes`, `RouteHandler`, `Register` and `RegisterOperation` take the `Env` as a last type parameter, `any` by default.
