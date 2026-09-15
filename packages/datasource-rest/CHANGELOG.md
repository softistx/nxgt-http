# @nxgt/datasource-rest

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
