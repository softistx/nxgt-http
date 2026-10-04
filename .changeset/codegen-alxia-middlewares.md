---
"@nxgt/openapi-codegen": minor
---

`alxia.ts` is written for `@alxia/core` 0.4's middleware model, and changes the generated output:

- **alxia's own 400 in the client files.** With `alxia: true` and `hono` off, `validationErrors` now declares alxia's `{ error: 'validation', issues: [{ target, path, code, message }] }` as `ValidationErrorBody` in `types.ts`, `zod.ts`, `operations.ts` and `paths.ts`, where it declared `@nxgt/openapi-hono`'s `{ status, message, timestamp, issues }`, which alxia never sends. With both `hono` and `alxia` on, it is a union of the two, since a client cannot tell which server answers. `withValidationErrors` takes the server as a third argument, `'hono'` by default.
- **Cookie parameters.** An `in: cookie` parameter no longer fails the run with `unsupported_parameter`. `alxia.ts` validates it as the route's `cookies`, read from its string; `types.ts`, `zod.ts`, `operations.ts` and `paths.ts` leave it out with an `ignored` warning, as a client does not set cookies; `hono.ts` routes the operation without validating it, with a `not_enforced` warning. A cookie that is a list or an object is still refused. The IR keeps them in `OperationIR.cookies`, and `ParamLocation` gains `'cookie'`.
- **Named server-sent events.** A stream whose `itemSchema` names its events is declared as `eventStream({ tick: zTick, done: zDone })`, sent by alxia with each event's `event:` line, where it was left out. One unnamed event stays `eventStream(schema)`. An event whose data is text, not JSON, is still left out with an `ignored` warning, which now names it.
- **Docs for the middleware model.** `alxia.ts` opens with a comment on `app.route(operation, ...middlewares, handler)`, `@alxia/core` 0.4 or later: the route's `responds`, run first, and its `validate` just before the handler unless `validate(operation)` stands earlier, and `matchesSpec` from `@alxia/openapi` (formerly `@alxia/openapi-routes`). The `operations` comment reads `app.route(operations.x, ...middlewares, handler)`.
- **TypeScript 7.** The `typescript` peer is `^6.0.3 || ^7.0.0`.
