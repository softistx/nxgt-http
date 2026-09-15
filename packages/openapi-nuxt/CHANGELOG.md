# @nxgt/openapi-nuxt

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
