# @nxgt/openapi-httpyz

## 0.1.0

### Minor Changes

- [#10](https://github.com/softistx/nxgt-http/pull/10) [`810a97d`](https://github.com/softistx/nxgt-http/commit/810a97dda83a9618ebd317e09874ffd51121e4c4) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Cancel a bound client's calls together with `api.group()`.
  
  `api.group()` is the same client over the core client's `http.group()`: its calls and streams also end on `cancel(reason?)`, and `signal` aborts on the next `cancel()`. A call's init already takes the client's `signal` and `latest`, which aborts the call before it with the same key.

- [#13](https://github.com/softistx/nxgt-http/pull/13) [`752b3f7`](https://github.com/softistx/nxgt-http/commit/752b3f77bf9f4b2abb086c679864fdd5180ec9d3) Thanks [@SteveGT96](https://github.com/SteveGT96)! - For a package built over the bound client, which types and reads its calls the way the client does:
  
  - `api.operations` is the generated table the client was bound to, and a group's too.
  - `PathsOf<Routes, Method>` and `IdOf<Ops, Routes, Method, Path>` are exported: the paths that have an operation for a method, and the `operationId` of the operation at a route.

- [#6](https://github.com/softistx/nxgt-http/pull/6) [`be69f9c`](https://github.com/softistx/nxgt-http/commit/be69f9cb09b092bf7a506649f18701adf4b0d251) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Read an operation's stream with `api.stream(operationId, input, init)`.
  
  For an operation whose reply the spec describes an item at a time (OpenAPI 3.2's `itemSchema`), `stream()` returns the client's server-sent events, each narrowed on its `event`, or its JSON lines. It writes the input as a call does and sends the stream's media type as `Accept`. `validate` checks the request on the first read, before anything is sent, and each item as it comes; `decode` yields what each schema outputs. An operation without a stream does not compile.

- [#1](https://github.com/softistx/nxgt-http/pull/1) [`eba5ec8`](https://github.com/softistx/nxgt-http/commit/eba5ec8b79a352d13731a33d5f11f4b005c66260) Thanks [@SteveGT96](https://github.com/SteveGT96)! - New package: the operations `@nxgt/openapi-codegen` generates, called through an `@nxgt/httpyz` client. `createOpenApiClient(http, operations)` gives `api.op(id, input)` and `api.get(path, input)` for each method the spec has an operation for, typed from the generated `operations` table alone. The path, the parameters and the body are checked against the spec at compile time, and a call resolves to one of the declared replies, narrowed on its status.
  
  `validate: true` checks the request before it is sent, as the routes `@nxgt/openapi-hono` generates from the same spec would, and the reply before it is returned, throwing a `ValidationError` with the issues the server would report. `decode: true` returns each reply as its schema outputs it, and types it so: with `dates: 'date'`, a date-time is a `Date`.

### Patch Changes

- [#24](https://github.com/softistx/nxgt-http/pull/24) [`7f8bef2`](https://github.com/softistx/nxgt-http/commit/7f8bef228fa4ce8803b750f6ddf6de0e3b5dbf99) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Each README now has an **API** section, after the usage sections, that documents every export: each function and method with its signature, options, return value and errors, each class with its members, and each type.

- [#5](https://github.com/softistx/nxgt-http/pull/5) [`0340149`](https://github.com/softistx/nxgt-http/commit/0340149dbb3980e656730c611059245071994fee) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Describe streamed replies an item at a time, from OpenAPI 3.2's `itemSchema`.
  
  A 2xx reply of server-sent events (`text/event-stream`) or JSON Lines (`application/jsonl`, `application/x-ndjson`, `application/json-seq`) now gives its operation a `stream` in `ClientOperations` and `Operations`:
  
  - for events, a union narrowed on `event`, each event's `data` typed by its `contentSchema` when it is JSON (`contentMediaType: application/json`), and as text otherwise; an event sent without a name is a `message`;
  - for JSON Lines, the type of each line.
  
  In `operations.ts`, such a reply is `{ kind: 'sse', events: { update: zItem, ping: null } }` or `{ kind: 'jsonl', item: zItem }`: a validator per event name, or per line. `@nxgt/openapi-hono` and `@nxgt/openapi-httpyz` accept these tables.
  
  A `text/event-stream` reply was typed `text` before, and a JSON Lines one `binary`: their `kind` in `operations.ts` changes accordingly.

- [#23](https://github.com/softistx/nxgt-http/pull/23) [`0759ad4`](https://github.com/softistx/nxgt-http/commit/0759ad44fa8f44c9545c91c4516240dac18c92f1) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Exports `PathMethods<Ops, Routes, Decoded>`, the client's `get`, `post`… for the methods the spec has an operation for, for a package that offers them on an object of its own.
- Updated dependencies [[`7f8bef2`](https://github.com/softistx/nxgt-http/commit/7f8bef228fa4ce8803b750f6ddf6de0e3b5dbf99), [`db77777`](https://github.com/softistx/nxgt-http/commit/db77777bca24768bbcfae9b1821d842d0350104f), [`a0a4992`](https://github.com/softistx/nxgt-http/commit/a0a4992ce185dfbc870dac22386687476d9adb2a), [`8ac32ac`](https://github.com/softistx/nxgt-http/commit/8ac32ac6981583ed56734ce69b88fde803b14205), [`71ced62`](https://github.com/softistx/nxgt-http/commit/71ced62c2bef0d75ca11e08b2fcde50355574526), [`eba5ec8`](https://github.com/softistx/nxgt-http/commit/eba5ec8b79a352d13731a33d5f11f4b005c66260)]:
  - @nxgt/httpyz@0.1.0
