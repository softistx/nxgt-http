# @nxgt/openapi-codegen

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
