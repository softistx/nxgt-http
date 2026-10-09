# @nxgt/openapi-codegen

## 0.9.0

### Minor Changes

- [#126](https://github.com/softistx/nxgt-http/pull/126) [`ff7922f`](https://github.com/softistx/nxgt-http/commit/ff7922f0ab9055b481d7e44d07689d9fe42f3677) Thanks [@SteveGT96](https://github.com/SteveGT96)! - `@nxgt/typespec`: add `@queryMethod`, which marks a `@post` as an HTTP `QUERY`, a safe request with a body, until `@typespec/http` declares the method. It stays a `POST` on the wire and the document gets `x-nxgt-method: query`; `@operationIds` checks its verb as a `QUERY`'s, so `search` and `query` accept it; on anything but a `@post` it is the error `query-method-not-post`.
  
  `@nxgt/openapi-codegen`: read `x-nxgt-method: query` on a `POST` as a `QUERY` sent as a `POST`: its entry in the generated `operations` table has `queryMethod: true`, typed `readonly queryMethod?: true` on `OperationSpec`. With another value, on another method, or on an OpenAPI 3.2 `query` operation, which is a `QUERY` already, it is ignored with the warning `ignored`.

## 0.8.0

### Minor Changes

- [#120](https://github.com/softistx/nxgt-http/pull/120) [`3127d2b`](https://github.com/softistx/nxgt-http/commit/3127d2b08a239db9a35ed14949685d703fba7664) Thanks [@SteveGT96](https://github.com/SteveGT96)! - A string schema with `x-nxgt-scalar`, one of `@nxgt/typespec`'s scalars, is now generated as `z.string().regex(pattern)`: its `pattern` is the rule, and a Zod format validator would second-guess it (`z.url()` trims its input, `z.email()` refuses a punycode top-level label). Its `format` (`iban`, `country-code`, `email`, `uri`, `byte`…) is no longer read, so it no longer warns `unknown_format`. `date-time` is the exception: the `dates: 'date'` option decodes through it. The pattern is validated as before.

## 0.7.3

### Patch Changes

- [#109](https://github.com/softistx/nxgt-http/pull/109) [`86194d4`](https://github.com/softistx/nxgt-http/commit/86194d43f341de1cbec71281d63ae13c971d781d) Thanks [@SteveGT96](https://github.com/SteveGT96)! - A schema whose `type` lists every type plus `null` is now `{ kind: 'unknown' }` in the IR, no longer `unknown` marked `nullable`. The generated code reads `unknown` and `z.unknown()` instead of `unknown | null` and `z.unknown().nullable()`. Both accept the same values, since `unknown` already takes `null`.

## 0.7.2

### Patch Changes

- [#104](https://github.com/softistx/nxgt-http/pull/104) [`c9a59d7`](https://github.com/softistx/nxgt-http/commit/c9a59d7dccdcd84a15e0a957d64367e4c8c7c98a) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The roadmap lists specs authored in TypeSpec under Shipped, in 0.5.0.
  
  It also lists `@nxgt/typespec` as its own package, first released as 0.1.0, and drops it from Next.

## 0.7.1

### Patch Changes

- [#96](https://github.com/softistx/nxgt-http/pull/96) [`df0cea6`](https://github.com/softistx/nxgt-http/commit/df0cea6c1f57616de55cc909f7e4faebcb65590d) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Build and type-check under a stricter `tsconfig` — `exactOptionalPropertyTypes`, `noPropertyAccessFromIndexSignature`, `noImplicitReturns`, `noUnusedLocals` and the rest — so the published declarations compile under any of them in an application. Classes are now emitted with defined fields (`useDefineForClassFields`); no field's presence, order or value changes. `lint` and `loadDocument`'s `fs` take `undefined` as left out. The fields `buildIR` and `Resolver.deref` write as `undefined` when the spec has none are typed `| undefined`, as they are: `ApiIR`'s `title` and `apiVersion`, an operation's `summary`, `description` and `body`, a parameter's, a body's and a response's `description`, a schema's `description` as a parameter's validated schema carries it, a parameter's `deprecated`, a media type's `schema`, and `Resolved`'s `summary` and `description`. Redocly's `loadConfig` is called with no `configPath` key rather than an `undefined` one when no `redocly.yaml` is found, which it reads the same. An application under `exactOptionalPropertyTypes` that copies these output fields (the IR's and `Resolved`'s) into its own `?: T` field now sees the `undefined` they already held.

## 0.7.0

### Minor Changes

- [#99](https://github.com/softistx/nxgt-http/pull/99) [`6611e89`](https://github.com/softistx/nxgt-http/commit/6611e8918a93567a48d00ccea41ae6b134b37131) Thanks [@SteveGT96](https://github.com/SteveGT96)! - `alxia.ts` is written for `@alxia/core` 0.4's middleware model, and changes the generated output:
  
  - **alxia's own 400 in the client files.** With `alxia: true` and `hono` off, `validationErrors` now declares alxia's `{ error: 'validation', issues: [{ target, path, code, message }] }` as `ValidationErrorBody` in `types.ts`, `zod.ts`, `operations.ts` and `paths.ts`, where it declared `@nxgt/openapi-hono`'s `{ status, message, timestamp, issues }`, which alxia never sends. With both `hono` and `alxia` on, it is a union of the two, since a client cannot tell which server answers. `withValidationErrors` takes the server as a third argument, `'hono'` by default.
  - **Cookie parameters.** An `in: cookie` parameter no longer fails the run with `unsupported_parameter`. `alxia.ts` validates it as the route's `cookies`, read from its string; `types.ts`, `zod.ts`, `operations.ts` and `paths.ts` leave it out with an `ignored` warning, as a client does not set cookies; `hono.ts` routes the operation without validating it, with a `not_enforced` warning. A cookie that is a list or an object is still refused. The IR keeps them in `OperationIR.cookies`, and `ParamLocation` gains `'cookie'`.
  - **Named server-sent events.** A stream whose `itemSchema` names its events is declared as `eventStream({ tick: zTick, done: zDone })`, sent by alxia with each event's `event:` line, where it was left out. One unnamed event stays `eventStream(schema)`. An event whose data is text, not JSON, is still left out with an `ignored` warning, which now names it.
  - **Docs for the middleware model.** `alxia.ts` opens with a comment on `app.route(operation, ...middlewares, handler)`, `@alxia/core` 0.4 or later: the route's `validate` of the request and `responds` of the handler's reply, both just before the handler unless `validate(operation)` or `responds(operation)` stands earlier, and `matchesSpec` from `@alxia/openapi` (formerly `@alxia/openapi-routes`). The `operations` comment reads `app.route(operations.x, ...middlewares, handler)`.
  - **TypeScript 7.** The `typescript` peer is `^6.0.3 || ^7.0.0`.

## 0.6.0

### Minor Changes

- [#94](https://github.com/softistx/nxgt-http/pull/94) [`a45c5b8`](https://github.com/softistx/nxgt-http/commit/a45c5b828ed7cdf2e0e77be055b36d98c82798cd) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Add the `alxia` option, which writes `alxia.ts`: each operation as the data an alxia app's `app.route(operation, handler)` takes — its method, its path written `/pets/:petId`, and its schemas with their concrete Zod types — and `operations`, all of them by `operationId`. The file imports only `zod` and `./zod`, plus `eventStream` from `@alxia/core` for a reply of server-sent events. The schemas read what alxia hands over: path parameters as strings, a query list given once as a list of one, headers lowercased, a body as JSON, a form or text. alxia answers a refused request with its own 400, so the 400 of `validationErrors` is not declared there. An operation alxia cannot route or validate yet (a `TRACE`, a parameter sharing its path segment, a binary body or reply, JSON Lines, named events) is left out with an `ignored` warning.

## 0.5.1

### Patch Changes

- [#73](https://github.com/softistx/nxgt-http/pull/73) [`cd64ea2`](https://github.com/softistx/nxgt-http/commit/cd64ea229decc3596986e7a756dd063a4aff0cba) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The TypeSpec guide says how `@nxgt/typespec`'s `@operationIds` now names operations: as written, on an interface or the service namespace.

## 0.5.0

### Minor Changes

- [#59](https://github.com/softistx/nxgt-http/pull/59) [`200e9be`](https://github.com/softistx/nxgt-http/commit/200e9be733f16455a581e9b4fa7cac809f416559) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Read a schema-valued `unevaluatedProperties` as `additionalProperties` where the two see the same keys: no `additionalProperties` beside it, and no `$ref`, `allOf`, `anyOf`, `oneOf`, `if`/`then`/`else` or `dependentSchemas`. It is how TypeSpec's `Record<T>` reaches OpenAPI 3.1, and it was refused with `unsupported_keyword`. Beside one of those keywords it is still refused, with a message that says so.

### Patch Changes

- [#59](https://github.com/softistx/nxgt-http/pull/59) [`1e43da4`](https://github.com/softistx/nxgt-http/commit/1e43da41057d9e97e93972709a0f0e7a328a6613) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Document authoring the spec in TypeSpec: a guide page, `docs/guide/typespec.md`, on compiling it to OpenAPI 3.1 with `@typespec/openapi3`, what each construct becomes, and how to name operations and templates; a README section with a copy-paste example. The package's `docs/` also gains a troubleshooting page and a roadmap.

## 0.4.1

### Patch Changes

- [#49](https://github.com/softistx/nxgt-http/pull/49) [`1145c07`](https://github.com/softistx/nxgt-http/commit/1145c077c45582d463ed59527dec64fe1f0de8dd) Thanks [@SteveGT96](https://github.com/SteveGT96)! - A class is defined once per package, not once per entry point
  
  `build.ts` ran `Bun.build` without `splitting`, so a shared module was inlined
  into **every** entry bundle instead of being imported from one chunk. A package
  with several entry points therefore handed an app two copies of its own classes,
  and `instanceof` across the two was false.
  
  `@nxgt/httpyz` shipped exactly that for its whole error hierarchy —
  `ValidationError`, `NetworkError`, `TimeoutError`, `ReplyStatusError`,
  `ClientError`, `UndeclaredStatusError` — in `dist/index.js` and again in
  `dist/integration/index.js`, because `/integration` re-exports `METHODS` and
  that pulled `create-http-client` in behind it. `@nxgt/openapi-codegen` did the
  same across `index.js` and its `cli.js` bin.
  
  It was inert rather than broken: nothing `/integration` exports throws today, so
  no consumer could observe the split — which is the reason it survived. The next
  export added there is what would have made it bite, silently, in an app catching
  `ValidationError`.
  
  `verify:artifacts` now refuses a tarball that defines any class twice, and that
  check is the durable part. It is deliberately a scan of the entry bundles rather
  than a runtime `instanceof` probe: a runtime probe would have passed.

## 0.4.0

### Minor Changes

- [#43](https://github.com/softistx/nxgt-http/pull/43) [`ded70d8`](https://github.com/softistx/nxgt-http/commit/ded70d8b161744a74400d0839280d6abe78728bf) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The generated files import each other without an extension (`'./types'`, not `'./types.js'`): `importExtension` defaults to `''`. An app whose `tsconfig` resolves with `node16` or `nodenext`, or that runs the files with Node without a bundler, sets `importExtension: '.js'` to keep them as they were.

- [#43](https://github.com/softistx/nxgt-http/pull/43) [`ded70d8`](https://github.com/softistx/nxgt-http/commit/ded70d8b161744a74400d0839280d6abe78728bf) Thanks [@SteveGT96](https://github.com/SteveGT96)! - `c.env` is typed in the handlers of `routes`: `createRoutes(app)` and `createApi().routes(app)` take the app's `Env` from its `Hono<E>`, so a handler reads `c.env.db` as the app declares it. Regenerate `hono.ts` to get it. `Routes`, `RouteHandler`, `Register` and `RegisterOperation` take the `Env` as a last type parameter, `any` by default.

## 0.3.0

### Minor Changes

- [#29](https://github.com/softistx/nxgt-http/pull/29) [`92c9559`](https://github.com/softistx/nxgt-http/commit/92c9559a46928a8047d074d97844c8eddfa340cc) Thanks [@SteveGT96](https://github.com/SteveGT96)! - - **`@nxgt/openapi-codegen`**: every operation that takes a parameter or a body now declares the 400 that `@nxgt/openapi-hono` answers a refused request with. Its body is `ValidationErrorBody`, `{ status: 400, message, timestamp, issues }`, with its validator `zValidationErrorBody`.
    - How it is declared:
      - on an operation without a 400, it is that 400;
      - on a 400 whose JSON media type has a schema, it is a union with that schema. The JSON media type is `application/json`, or the one a client reads an `application/json` reply as, such as `application/problem+json`;
      - on a 400 without a JSON media type, `application/json` is added to it.
    - Why: a client that decodes its replies, which `@nxgt/openapi-httpyz` now does by default, reads the refusal instead of throwing a `ValidationError`.
    - The new `validationErrors` option, `true` by default, turns this off with `false`, for an app whose `onValidationError` answers with a body of its own.
    - `withValidationErrors(ir, root)` and `VALIDATION_ERROR_BODY` are exported, for tools built on the pipeline.
  - **`@nxgt/openapi-httpyz`**, **`@nxgt/openapi-hono`**: the READMEs say so.

## 0.2.1

### Patch Changes

- [#25](https://github.com/softistx/nxgt-http/pull/25) [`d2f70b5`](https://github.com/softistx/nxgt-http/commit/d2f70b56f728cc8770adf09199484f2914d2b6b6) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Licensed MIT: the package ships a LICENSE file. It was `UNLICENSED` before, which gave no one the right to use it.

## 0.2.0

### Minor Changes

- [#1](https://github.com/softistx/nxgt-http/pull/1) [`eba5ec8`](https://github.com/softistx/nxgt-http/commit/eba5ec8b79a352d13731a33d5f11f4b005c66260) Thanks [@SteveGT96](https://github.com/SteveGT96)! - `types.ts` now declares `ClientOperations`: for each operation, the `args` a client call takes (its parameters and body as the caller writes them, optional when nothing is required) and every declared `reply` as `{ status, type, data }`, decoded, with `wire` as JSON carries it. A form reply's `data` is a `FormData`, which is what a client reads from it. `@nxgt/openapi-httpyz` reads it; a schema named `ClientOperations` is now a `name_collision`.

- [#19](https://github.com/softistx/nxgt-http/pull/19) [`d44eafd`](https://github.com/softistx/nxgt-http/commit/d44eafd35dba24d47f40f9ef8337b11924b4121f) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The generated `operations` table carries each operation's `ClientOperations` entry in its type, as `OperationSpec<ClientOperations[K]>`, so `createOpenApiClient(http, operations)` from `@nxgt/openapi-httpyz` is typed from the table alone. Nothing changes at runtime: `'~client'` is a type that is never set.

- [#1](https://github.com/softistx/nxgt-http/pull/1) [`eba5ec8`](https://github.com/softistx/nxgt-http/commit/eba5ec8b79a352d13731a33d5f11f4b005c66260) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The Hono runtime moved to its own package, `@nxgt/openapi-hono`, and the `@nxgt/openapi-codegen/hono` subpath is gone. The generated `hono.ts` imports `@nxgt/openapi-hono`, so an app that generates with `hono: true` installs it: `bun add @nxgt/openapi-hono`, then generate again. `hono` is no longer a peer of the generator.

- [#5](https://github.com/softistx/nxgt-http/pull/5) [`0340149`](https://github.com/softistx/nxgt-http/commit/0340149dbb3980e656730c611059245071994fee) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Describe streamed replies an item at a time, from OpenAPI 3.2's `itemSchema`.
  
  A 2xx reply of server-sent events (`text/event-stream`) or JSON Lines (`application/jsonl`, `application/x-ndjson`, `application/json-seq`) now gives its operation a `stream` in `ClientOperations` and `Operations`:
  
  - for events, a union narrowed on `event`, each event's `data` typed by its `contentSchema` when it is JSON (`contentMediaType: application/json`), and as text otherwise; an event sent without a name is a `message`;
  - for JSON Lines, the type of each line.
  
  In `operations.ts`, such a reply is `{ kind: 'sse', events: { update: zItem, ping: null } }` or `{ kind: 'jsonl', item: zItem }`: a validator per event name, or per line. `@nxgt/openapi-hono` and `@nxgt/openapi-httpyz` accept these tables.
  
  A `text/event-stream` reply was typed `text` before, and a JSON Lines one `binary`: their `kind` in `operations.ts` changes accordingly.

- [#7](https://github.com/softistx/nxgt-http/pull/7) [`3a0f943`](https://github.com/softistx/nxgt-http/commit/3a0f9436536550f5cadc8cd1c934560149bb553e) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Stream a reply an item at a time from a handler, with `streamEvents()` and `streamLines()`.
  
  With the `hono` option, `hono.ts` now exports `streamEvents(c, operationId, write)` for each operation that replies with server-sent events, and `streamLines(c, operationId, write)` for each operation that replies with JSON Lines. Both are typed by the spec's `itemSchema`:
  
  ```ts
  routes.get('/feed', (c) =>
  	streamEvents(c, 'watchFeed', async (stream) => {
  		await stream.write({ event: 'update', id: '7', data: item });
  	}),
  );
  ```
  
  - An event's data is sent as JSON when the spec declares it JSON, and as text otherwise.
  - JSON lines are sent as the media type the spec declares, with a record separator for `application/json-seq`.
  - With `validateResponses`, each item is checked before it is sent. A failing item is never sent: it goes to `onValidationError` for its side effects, and the stream ends.
  - The writer's `aborted` and `onAbort()` tell when the client went away.
  
  `@nxgt/openapi-hono` still imports `hono` for types only.

### Patch Changes

- [#24](https://github.com/softistx/nxgt-http/pull/24) [`7f8bef2`](https://github.com/softistx/nxgt-http/commit/7f8bef228fa4ce8803b750f6ddf6de0e3b5dbf99) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Each README now has an **API** section, after the usage sections, that documents every export: each function and method with its signature, options, return value and errors, each class with its members, and each type.

- [#16](https://github.com/softistx/nxgt-http/pull/16) [`a3e048b`](https://github.com/softistx/nxgt-http/commit/a3e048bcce3fe57a4ff42a96b368ae84f9f7caff) Thanks [@SteveGT96](https://github.com/SteveGT96)! - A spec with no schema no longer generates a `zod.ts` that imports `z` without using it, which an app built with `noUnusedLocals` refused. The file is now an empty module. Every file the generator writes is checked with the strictest TypeScript settings, on every fixture.

## 0.1.0

### Minor Changes

- [#59](https://github.com/softistx/nxgt-core/pull/59) [`4759903`](https://github.com/softistx/nxgt-core/commit/475990346eb846bb85b13ab1c018ba0ad760e359) Thanks [@SteveGT96](https://github.com/SteveGT96)! - New package: generate TypeScript types, Zod 4 validators, a typed operations table and an openapi-fetch `paths` type from an OpenAPI 3.1 or 3.2 document — one file or split across many, `$ref`s into `node_modules` included. Types and validators come from one model, so they agree. Run `nxgt-openapi generate` (a config file, or `--input`) or call `generate()`. With `hono: true`, `@nxgt/openapi-codegen/hono` gives typed Hono routes that validate requests before your handler runs. `dates: 'date'` decodes date-times to `Date`; `lint` runs Redocly over the spec first. `zod` is a required peer; `hono` and `@redocly/openapi-core` are optional.
