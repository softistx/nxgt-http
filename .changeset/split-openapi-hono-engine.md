---
---

Nothing is published: `@nxgt/openapi-hono`'s `src/engine.ts` is split by role into `src/route/`, one file per part of registering, validating and replying. `engine.ts` keeps the runtime types, `runningRoute` and `createApi`, which puts the parts in order. Every declaration the package exposes is byte for byte what it was.
