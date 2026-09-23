# @nxgt/httpyz-query

## 0.2.2

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
- Updated dependencies [[`1145c07`](https://github.com/softistx/nxgt-http/commit/1145c077c45582d463ed59527dec64fe1f0de8dd)]:
  - @nxgt/httpyz@0.3.1

## 0.2.1

### Patch Changes

- Updated dependencies [[`84805cc`](https://github.com/softistx/nxgt-http/commit/84805ccba1da28e0dbcc02237391160a418e3a1e)]:
  - @nxgt/httpyz@0.3.0
  - @nxgt/openapi-httpyz@0.3.0

## 0.2.0

### Minor Changes

- [#26](https://github.com/softistx/nxgt-http/pull/26) [`a4d9cbc`](https://github.com/softistx/nxgt-http/commit/a4d9cbc3ac1dc30a9987b38811a1ec5ca45ed9e0) Thanks [@SteveGT96](https://github.com/SteveGT96)! - - **`@nxgt/httpyz`**:
    - The `fetch` option may return a `Response` at once, as well as a promise of one: `fetch: app.fetch` takes a Hono app as it is, with no `async` wrapper.
    - In `responses`, a status declared with an empty media map, `{}`, types as `null` does: a reply without a body, instead of `never`.
  - **`@nxgt/httpyz-query`**:
    - `queryKey()`'s input takes `header` and `decode: false`, as the keys already hold them, so a filter can name them.
    - In `./openapi`, `mutationOptions(method, path, init)` also takes a function of `mutate()`'s input that returns each call's init: its own `signal`, `latest` or headers.
    - `infiniteQueryOptions` throws at once for an operation the spec does not have, as `queryOptions` and `mutationOptions` do.
    - `./openapi` also exports `KeyInput`, `Paging`, `QueriesOptions`, `HttpQueryKey`, `HttpQueryOptions` and `HttpInfiniteQueryOptions`, and the new `MutationInit`.

### Patch Changes

- [#25](https://github.com/softistx/nxgt-http/pull/25) [`d2f70b5`](https://github.com/softistx/nxgt-http/commit/d2f70b56f728cc8770adf09199484f2914d2b6b6) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Licensed MIT: the package ships a LICENSE file. It was `UNLICENSED` before, which gave no one the right to use it.
- Updated dependencies [[`d2f70b5`](https://github.com/softistx/nxgt-http/commit/d2f70b56f728cc8770adf09199484f2914d2b6b6), [`b4688b2`](https://github.com/softistx/nxgt-http/commit/b4688b215d49c7feb7743bbd064e6feb6da6c4aa), [`a4d9cbc`](https://github.com/softistx/nxgt-http/commit/a4d9cbc3ac1dc30a9987b38811a1ec5ca45ed9e0)]:
  - @nxgt/httpyz@0.2.0
  - @nxgt/openapi-httpyz@0.2.0

## 0.1.0

### Minor Changes

- [#13](https://github.com/softistx/nxgt-http/pull/13) [`752b3f7`](https://github.com/softistx/nxgt-http/commit/752b3f77bf9f4b2abb086c679864fdd5180ec9d3) Thanks [@SteveGT96](https://github.com/SteveGT96)! - `@nxgt/httpyz-query/openapi`: TanStack Query options for the operations of an `@nxgt/openapi-httpyz` bound client.
  
  `createOpenApiQueries(api)` takes a call as the bound client does, by method and path, and returns `queryOptions`, `infiniteQueryOptions`, `mutationOptions` and `queryKey`. It reads the spec from the client's own `operations`. A key holds the operation's input and never its init. `pageParamName` must be one of the operation's query parameters. A decoding client's queries resolve to what its schemas output. `@nxgt/openapi-httpyz` is an optional peer.

- [#12](https://github.com/softistx/nxgt-http/pull/12) [`8ac32ac`](https://github.com/softistx/nxgt-http/commit/8ac32ac6981583ed56734ce69b88fde803b14205) Thanks [@SteveGT96](https://github.com/SteveGT96)! - TanStack Query options for the calls of an `@nxgt/httpyz` client.
  
  `createQueries(http)` gives `queryOptions`, `infiniteQueryOptions`, `mutationOptions` and `queryKey`. Each one returns a plain options object that any adapter takes. A query resolves to the data of a 2xx reply, and its call is sent with the query's `signal`, so a cancelled query aborts its request. Keys tell calls apart by what they send and are tagged with their data. An infinite query sends each page param as a query parameter.

### Patch Changes

- [#24](https://github.com/softistx/nxgt-http/pull/24) [`7f8bef2`](https://github.com/softistx/nxgt-http/commit/7f8bef228fa4ce8803b750f6ddf6de0e3b5dbf99) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Each README now has an **API** section, after the usage sections, that documents every export: each function and method with its signature, options, return value and errors, each class with its members, and each type.
- Updated dependencies [[`7f8bef2`](https://github.com/softistx/nxgt-http/commit/7f8bef228fa4ce8803b750f6ddf6de0e3b5dbf99), [`db77777`](https://github.com/softistx/nxgt-http/commit/db77777bca24768bbcfae9b1821d842d0350104f), [`a0a4992`](https://github.com/softistx/nxgt-http/commit/a0a4992ce185dfbc870dac22386687476d9adb2a), [`8ac32ac`](https://github.com/softistx/nxgt-http/commit/8ac32ac6981583ed56734ce69b88fde803b14205), [`71ced62`](https://github.com/softistx/nxgt-http/commit/71ced62c2bef0d75ca11e08b2fcde50355574526), [`eba5ec8`](https://github.com/softistx/nxgt-http/commit/eba5ec8b79a352d13731a33d5f11f4b005c66260), [`0340149`](https://github.com/softistx/nxgt-http/commit/0340149dbb3980e656730c611059245071994fee), [`810a97d`](https://github.com/softistx/nxgt-http/commit/810a97dda83a9618ebd317e09874ffd51121e4c4), [`0759ad4`](https://github.com/softistx/nxgt-http/commit/0759ad44fa8f44c9545c91c4516240dac18c92f1), [`752b3f7`](https://github.com/softistx/nxgt-http/commit/752b3f77bf9f4b2abb086c679864fdd5180ec9d3), [`be69f9c`](https://github.com/softistx/nxgt-http/commit/be69f9cb09b092bf7a506649f18701adf4b0d251), [`eba5ec8`](https://github.com/softistx/nxgt-http/commit/eba5ec8b79a352d13731a33d5f11f4b005c66260)]:
  - @nxgt/httpyz@0.1.0
  - @nxgt/openapi-httpyz@0.1.0
