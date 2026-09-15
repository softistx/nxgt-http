---
'@nxgt/openapi-nuxt': minor
---

Two presets:

- `useApiData(key?, (api, { signal }) => …, options?)` is `useAsyncData`
  whose handler receives the client. A reply comes back without its
  `Response`, which the SSR payload cannot carry: `{ status, type, data }`,
  narrowed by its status. The key is optional, as it is for `useAsyncData`.
- `createHonoApp()` is `new Hono<{ Bindings: { event: H3Event } }>()`, so
  `c.env.event` is typed. It is auto-imported in the server's files and
  exported by `@nxgt/openapi-nuxt/hono`. `hono` is an optional peer.
