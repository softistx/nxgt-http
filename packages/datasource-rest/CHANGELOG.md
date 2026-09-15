# @nxgt/datasource-rest

## 3.0.1

### Patch Changes

- Updated dependencies [[`84805cc`](https://github.com/softistx/nxgt-http/commit/84805ccba1da28e0dbcc02237391160a418e3a1e)]:
  - @nxgt/httpyz@0.3.0
  - @nxgt/openapi-httpyz@0.3.0

## 3.0.0

### Major Changes

- [#28](https://github.com/softistx/nxgt-http/pull/28) [`b4688b2`](https://github.com/softistx/nxgt-http/commit/b4688b215d49c7feb7743bbd064e6feb6da6c4aa) Thanks [@SteveGT96](https://github.com/SteveGT96)! - - **`@nxgt/openapi-httpyz`**:
    - **Breaking:** a bound client checks and decodes by default, as a plain call of the core client checks a declared reply. `validate` defaults to `true`, so the request is checked before it is sent and the reply before it is returned. `decode` defaults to `true`, so each reply is returned as its schema outputs it: with `dates: 'date'`, a date-time is a `Date`.
      - To keep the old behavior, pass `{ validate: false, decode: false }`.
      - Error replies are checked too. A 400 declared with a schema that does not describe what the server sends, such as `@nxgt/openapi-hono`'s validation body, now throws a `ValidationError` instead of returning the 400.
      - A client whose types are given now writes `false` as its third type argument to not decode: `createOpenApiClient<ClientOperations, OperationsByRoute, false>`, with `decode: false`.
    - A client has only the methods its spec has an operation for, at runtime as in its types: no `api.trace` without a TRACE operation.
    - A path with no operation for its method rejects with a `ClientError`, `GET /x: the spec has no operation at it`, instead of a plain `Error`.
  - **`@nxgt/datasource-rest`**:
    - **Breaking:** a datasource validates and decodes by default, as its client now does. `decode: false` and `validate: false` turn that off, and `RESTDataSource<Ops, Routes, false>` types a datasource that does not decode.
    - **Breaking:** a `validate` check that fails puts its issues in the new `DataSourceError.issues`. `data` is always the reply's body. A refused reply also carries its `status`.
    - `RESTDataSource.for(operations)` is a datasource class bound to the generated table, with its types taken from it, so there is no `ClientOperations` to import:
      ```ts
      class Bookmarks extends RESTDataSource.for(operations) {}
      new Bookmarks({ baseUrl, token });
      ```
      `RESTDataSource.for(operations, { decode: false })` does not decode. The new `BoundDataSource` type is what it returns.
    - `this.get()`, `this.post()` and the rest exist only for the spec's methods, set on each instance. A subclass's own method of the same name still wins.

### Patch Changes

- [#25](https://github.com/softistx/nxgt-http/pull/25) [`d2f70b5`](https://github.com/softistx/nxgt-http/commit/d2f70b56f728cc8770adf09199484f2914d2b6b6) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Licensed MIT: the package ships a LICENSE file. It was `UNLICENSED` before, which gave no one the right to use it.
- Updated dependencies [[`d2f70b5`](https://github.com/softistx/nxgt-http/commit/d2f70b56f728cc8770adf09199484f2914d2b6b6), [`b4688b2`](https://github.com/softistx/nxgt-http/commit/b4688b215d49c7feb7743bbd064e6feb6da6c4aa), [`a4d9cbc`](https://github.com/softistx/nxgt-http/commit/a4d9cbc3ac1dc30a9987b38811a1ec5ca45ed9e0)]:
  - @nxgt/httpyz@0.2.0
  - @nxgt/openapi-httpyz@0.2.0

## 2.0.0

### Major Changes

- [#20](https://github.com/softistx/nxgt-http/pull/20) [`400055f`](https://github.com/softistx/nxgt-http/commit/400055f150f842606aa4c3cb6be88c70b2b08e4a) Thanks [@SteveGT96](https://github.com/SteveGT96)! - `RESTDataSource` is now built over `@nxgt/openapi-httpyz`, not openapi-fetch, and depends on no exception package.
  
  - **The client.** It takes `{ baseUrl, operations }`, the table `@nxgt/openapi-codegen` generates, and is typed by `ClientOperations`: `class Bookmarks extends RESTDataSource<ClientOperations>`. Calls go through the shorthands of the bound client, `this.get('/bookmarks/{id}', { param: { id } })`, `this.post`, `this.query`…, one for each method the spec has an operation for; `this.api` is the client itself, for `op()`, `stream()` and `group()`. `this.data(call)` returns a 2xx reply's data and throws for any other.
  - **The token.** `token` replaces `authOptions`, and a function is now awaited before each request; before, a promise was sent as the header. `shouldUseToken` is gone.
  - **The cache.** `cache` replaces `cacheOptions`. By default it is `defaultCache`, shared by every datasource as before, and it keeps the reads, `GET`, `HEAD` and `QUERY`. It is now keyed by the token and by a `QUERY`'s body, so no caller gets another's reply and two searches are no longer one. It no longer keeps any `POST`, `PUT`, `PATCH` or `DELETE` reply: a search is a `QUERY`, and the `POST` whose path holds `/search` is no longer cached. It is bounded, `defaultCache.clear()` empties it, and `cache: false` turns it off.
  - **Errors.** A failed call throws a `DataSourceError`, the package's own, with a `code` (`UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `BAD_REQUEST`, `INTERNAL_SERVER_ERROR`, `SERVICE_UNAVAILABLE`), the reply's `status` and `data`, and `extensions`, which a GraphQL server reports. `toDataSourceError` replaces `errorToException`, and `@nxgt/shared-exceptions` is no longer a dependency.
  - **Peers.** `@nxgt/httpyz` and `@nxgt/openapi-httpyz` are now peers; `openapi-fetch` is gone.
  - **Unchanged.** `relayPaginate` and the `Paginated`, `Connection`, `Edge` and `PageInfo` types stay as they were. The old `MediaType`, `HttpMethod`, `UpperHttpMethod` and `ErrorResponse` types are gone.

### Patch Changes

- [#17](https://github.com/softistx/nxgt-http/pull/17) [`f91e556`](https://github.com/softistx/nxgt-http/commit/f91e55613dea8f40e8ce3dcd7dab3255559442aa) Thanks [@SteveGT96](https://github.com/SteveGT96)! - `@nxgt/datasource-rest` is now developed and published from `softistx/nxgt-http`, with its history. It no longer depends on `@nxgt/shared` or `lodash`, which it never imported.

- [#24](https://github.com/softistx/nxgt-http/pull/24) [`7f8bef2`](https://github.com/softistx/nxgt-http/commit/7f8bef228fa4ce8803b750f6ddf6de0e3b5dbf99) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Each README now has an **API** section, after the usage sections, that documents every export: each function and method with its signature, options, return value and errors, each class with its members, and each type.
- Updated dependencies [[`7f8bef2`](https://github.com/softistx/nxgt-http/commit/7f8bef228fa4ce8803b750f6ddf6de0e3b5dbf99), [`db77777`](https://github.com/softistx/nxgt-http/commit/db77777bca24768bbcfae9b1821d842d0350104f), [`a0a4992`](https://github.com/softistx/nxgt-http/commit/a0a4992ce185dfbc870dac22386687476d9adb2a), [`8ac32ac`](https://github.com/softistx/nxgt-http/commit/8ac32ac6981583ed56734ce69b88fde803b14205), [`71ced62`](https://github.com/softistx/nxgt-http/commit/71ced62c2bef0d75ca11e08b2fcde50355574526), [`eba5ec8`](https://github.com/softistx/nxgt-http/commit/eba5ec8b79a352d13731a33d5f11f4b005c66260), [`0340149`](https://github.com/softistx/nxgt-http/commit/0340149dbb3980e656730c611059245071994fee), [`810a97d`](https://github.com/softistx/nxgt-http/commit/810a97dda83a9618ebd317e09874ffd51121e4c4), [`0759ad4`](https://github.com/softistx/nxgt-http/commit/0759ad44fa8f44c9545c91c4516240dac18c92f1), [`752b3f7`](https://github.com/softistx/nxgt-http/commit/752b3f77bf9f4b2abb086c679864fdd5180ec9d3), [`be69f9c`](https://github.com/softistx/nxgt-http/commit/be69f9cb09b092bf7a506649f18701adf4b0d251), [`eba5ec8`](https://github.com/softistx/nxgt-http/commit/eba5ec8b79a352d13731a33d5f11f4b005c66260)]:
  - @nxgt/httpyz@0.1.0
  - @nxgt/openapi-httpyz@0.1.0

## 1.0.3

### Patch Changes

- [#57](https://github.com/softistx/nxgt-core/pull/57) [`1154ac6`](https://github.com/softistx/nxgt-core/commit/1154ac642f4a0dd843f78f7637150b0fa7ec87dc) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Ship complete npm pages for every package.
  
  Each README now has the same shape — what it is, install, subpaths, usage,
  then the traps — and covers the public API a consumer actually imports,
  not just the one-line summary. `@nxgt/security` keeps the engine, keto,
  unmatched, GraphQL wrapper and integrations; it drops only the in-monorepo
  paths and the Oathkeeper paragraph that no longer name anything.
- Updated dependencies [[`1154ac6`](https://github.com/softistx/nxgt-core/commit/1154ac642f4a0dd843f78f7637150b0fa7ec87dc)]:
  - @nxgt/shared-exceptions@1.0.3
  - @nxgt/shared@1.0.3

## 1.0.2

### Patch Changes

- [#17](https://github.com/softistx/nxgt-core/pull/17) [`f1829a2`](https://github.com/softistx/nxgt-core/commit/f1829a2f2284e216a7f786e5d3698c4743797a1a) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Write a real README for every package.
  
  The README is in `files`, so it is the package's page on npmjs — the first
  thing anyone outside these repositories reads. Ten of the twelve shipped the
  `bun init` boilerplate ("To run: `bun run src/index.ts`", which is not how a
  library is used), and five of those carried the **wrong package name** in the
  heading: `@nxgt/shared-logging` announced itself as `@nxgt/shared`,
  `@nxgt/shared-graphql` as `@nxgt/shared-exceptions`.
  
  Each now says what the package is, tables its subpaths, and names what will
  bite a consumer — `SHARED_SCHEMA_PATH` rather than a path into `src/`, `code`
  against `errorCode`, why mongoose must be imported from `@nxgt/shared-mongo`,
  which principal shape a context carries.
- Updated dependencies [[`f1829a2`](https://github.com/softistx/nxgt-core/commit/f1829a2f2284e216a7f786e5d3698c4743797a1a)]:
  - @nxgt/shared@1.0.2
  - @nxgt/shared-exceptions@1.0.2

## 1.0.1

### Patch Changes

- [#14](https://github.com/softistx/nxgt-core/pull/14) [`c3b40bd`](https://github.com/softistx/nxgt-core/commit/c3b40bddd24a0843d4e1826935c66a378100e98e) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Depend on siblings by range, not by exact version.
  
  `workspace:*` publishes as the exact version, so `@nxgt/shared-hono@1.0.2`
  demanded `@nxgt/shared-mongo@1.0.0` while the consuming app's own `^1.0.0`
  resolved to `1.1.0`. Both landed in the tree, each registered the `Audit` and
  `Migration` Mongoose models, and the second threw `OverwriteModelError` — 52
  failing specs in nxgt-federation, and two copies of the package in
  sellix-monorepo already.
  
  Internal dependencies are now `workspace:^`, which publishes as a caret range
  and dedupes. `verify-artifacts.ts` fails on an exact sibling pin so this cannot
  come back.
- Updated dependencies [[`c3b40bd`](https://github.com/softistx/nxgt-core/commit/c3b40bddd24a0843d4e1826935c66a378100e98e)]:
  - @nxgt/shared@1.0.1
  - @nxgt/shared-exceptions@1.0.1
