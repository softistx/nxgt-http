# @nxgt/openapi-nuxt

## 0.3.0

### Minor Changes

- [#45](https://github.com/softistx/nxgt-http/pull/45) [`d95f20e`](https://github.com/softistx/nxgt-http/commit/d95f20edf4b8359248e1261e4e919ebc6b6242e9) Thanks [@SteveGT96](https://github.com/SteveGT96)! - TanStack Query for the bound client, with `query: true` in the module's options and `@tanstack/vue-query` and `@nxgt/httpyz-query` installed:
  
  - `useApiQuery('get', '/items/{id}', { param: { id } })` is `useQuery` of an operation. Its input may hold refs, and the query follows them.
  - `useApiMutation('post', '/items')` is `useMutation` of one. Its `mutate()` takes the operation's input.
  - `useApiQueries()` gives the query options of `@nxgt/httpyz-query`, for `useQuery`, `useInfiniteQuery` or a query key to invalidate.
  
  The module installs Vue Query: one `QueryClient` per request, and what SSR fetched goes to the browser in the payload, with a default `staleTime` of 5 s. `query: { plugin: false }` is for an app that installs its own. The new subpath `@nxgt/openapi-nuxt/query` holds what the module writes into the app.

## 0.2.1

### Patch Changes

- [#43](https://github.com/softistx/nxgt-http/pull/43) [`b113b06`](https://github.com/softistx/nxgt-http/commit/b113b066220f190695b6cfb6793244d2f5605b77) Thanks [@SteveGT96](https://github.com/SteveGT96)! - README: with `@nxgt/openapi-hono` 0.3.0 and a regenerated `hono.ts`, `c.env.event` is typed in the handlers of `createRoutes(createHonoApp())` too; the trap that said otherwise is gone.
- Updated dependencies []:
  - @nxgt/openapi-httpyz@0.3.0

## 0.2.0

### Minor Changes

- [#41](https://github.com/softistx/nxgt-http/pull/41) [`1e56ca8`](https://github.com/softistx/nxgt-http/commit/1e56ca82a5eb82514e88001a0fabc5a239c58237) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Two presets:
  
  - `useApiData(key?, (api, { signal }) => …, options?)` is `useAsyncData`
    whose handler receives the client. A reply comes back without its
    `Response`, which the SSR payload cannot carry: `{ status, type, data }`,
    narrowed by its status. The key is optional, as it is for `useAsyncData`.
  - `createHonoApp()` is `new Hono<{ Bindings: { event: H3Event } }>()`, so
    `c.env.event` is typed. It is auto-imported in the server's files and
    exported by `@nxgt/openapi-nuxt/hono`. `hono` is an optional peer.

## 0.1.0

### Minor Changes

- [#37](https://github.com/softistx/nxgt-http/pull/37) [`813905d`](https://github.com/softistx/nxgt-http/commit/813905d26df0dc8bab10ed9bcbce491205c6a0ab) Thanks [@SteveGT96](https://github.com/SteveGT96)! - New package: a Nuxt module for the generated operations. It serves your
  Hono app in Nitro under a prefix (`/api` by default), and auto-imports
  `useApi()`, a client bound to your spec. During SSR, `useApi()` calls the app
  in process, carrying the incoming request's cookies and headers; in the
  browser, it calls the same origin.
