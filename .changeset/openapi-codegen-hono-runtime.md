---
'@nxgt/openapi-codegen': minor
---

The Hono runtime moved to its own package, `@nxgt/openapi-hono`, and the `@nxgt/openapi-codegen/hono` subpath is gone. The generated `hono.ts` imports `@nxgt/openapi-hono`, so an app that generates with `hono: true` installs it: `bun add @nxgt/openapi-hono`, then generate again. `hono` is no longer a peer of the generator.
