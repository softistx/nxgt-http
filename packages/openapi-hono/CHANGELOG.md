# @nxgt/openapi-hono

## 0.2.0

### Minor Changes

- [#33](https://github.com/softistx/nxgt-http/pull/33) [`f629a60`](https://github.com/softistx/nxgt-http/commit/f629a60e3c04bcb297c4e13d4c5124f24297f9b2) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The editor now completes the body in a handler's `c.json({ … }, status)`: it offers the fields of the body declared for that status, then only the ones not written yet. Hono's own `c.json()` takes any value, so it had nothing to offer.
  
  - **The body is typed by its status.** The handler's `c` has a `c.json()` whose body type follows the status passed after it, and the new `DeclaredJson` type describes it. The reply is still typed as Hono types it, so what a handler returns is checked against the spec exactly as before, and `c` is still a `Context`.
  - **One overload per chain length.** A registration, `routes.get()` and the other methods or `routes.operation()`, has one overload for each length up to five middlewares, then one for longer chains, as Hono's own `app.get` does. These are the new `Register` and `RegisterOperation` types. Before, a single rest of middlewares left the handler's `c` untyped while its reply was unfinished.

## 0.1.2

### Patch Changes

- [#29](https://github.com/softistx/nxgt-http/pull/29) [`92c9559`](https://github.com/softistx/nxgt-http/commit/92c9559a46928a8047d074d97844c8eddfa340cc) Thanks [@SteveGT96](https://github.com/SteveGT96)! - - **`@nxgt/openapi-codegen`**: every operation that takes a parameter or a body now declares the 400 that `@nxgt/openapi-hono` answers a refused request with. Its body is `ValidationErrorBody`, `{ status: 400, message, timestamp, issues }`, with its validator `zValidationErrorBody`.
    - How it is declared:
      - on an operation without a 400, it is that 400;
      - on a 400 whose JSON media type has a schema, it is a union with that schema. The JSON media type is `application/json`, or the one a client reads an `application/json` reply as, such as `application/problem+json`;
      - on a 400 without a JSON media type, `application/json` is added to it.
    - Why: a client that decodes its replies, which `@nxgt/openapi-httpyz` now does by default, reads the refusal instead of throwing a `ValidationError`.
    - The new `validationErrors` option, `true` by default, turns this off with `false`, for an app whose `onValidationError` answers with a body of its own.
    - `withValidationErrors(ir, root)` and `VALIDATION_ERROR_BODY` are exported, for tools built on the pipeline.
  - **`@nxgt/openapi-httpyz`**, **`@nxgt/openapi-hono`**: the READMEs say so.

## 0.1.1

### Patch Changes

- [#25](https://github.com/softistx/nxgt-http/pull/25) [`d2f70b5`](https://github.com/softistx/nxgt-http/commit/d2f70b56f728cc8770adf09199484f2914d2b6b6) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Licensed MIT: the package ships a LICENSE file. It was `UNLICENSED` before, which gave no one the right to use it.

## 0.1.0

### Minor Changes

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

- [#1](https://github.com/softistx/nxgt-http/pull/1) [`eba5ec8`](https://github.com/softistx/nxgt-http/commit/eba5ec8b79a352d13731a33d5f11f4b005c66260) Thanks [@SteveGT96](https://github.com/SteveGT96)! - New package: the runtime the `hono.ts` that `@nxgt/openapi-codegen` generates binds to its spec, which was the `@nxgt/openapi-codegen/hono` subpath. Its API is unchanged: `createRoutes(app)` registers typed routes that validate the request, then call the handler, and `createApi()` adds `missing()` and `assertComplete()` across modules.

### Patch Changes

- [#24](https://github.com/softistx/nxgt-http/pull/24) [`7f8bef2`](https://github.com/softistx/nxgt-http/commit/7f8bef228fa4ce8803b750f6ddf6de0e3b5dbf99) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Each README now has an **API** section, after the usage sections, that documents every export: each function and method with its signature, options, return value and errors, each class with its members, and each type.

- [#5](https://github.com/softistx/nxgt-http/pull/5) [`0340149`](https://github.com/softistx/nxgt-http/commit/0340149dbb3980e656730c611059245071994fee) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Describe streamed replies an item at a time, from OpenAPI 3.2's `itemSchema`.
  
  A 2xx reply of server-sent events (`text/event-stream`) or JSON Lines (`application/jsonl`, `application/x-ndjson`, `application/json-seq`) now gives its operation a `stream` in `ClientOperations` and `Operations`:
  
  - for events, a union narrowed on `event`, each event's `data` typed by its `contentSchema` when it is JSON (`contentMediaType: application/json`), and as text otherwise; an event sent without a name is a `message`;
  - for JSON Lines, the type of each line.
  
  In `operations.ts`, such a reply is `{ kind: 'sse', events: { update: zItem, ping: null } }` or `{ kind: 'jsonl', item: zItem }`: a validator per event name, or per line. `@nxgt/openapi-hono` and `@nxgt/openapi-httpyz` accept these tables.
  
  A `text/event-stream` reply was typed `text` before, and a JSON Lines one `binary`: their `kind` in `operations.ts` changes accordingly.
