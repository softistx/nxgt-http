---
'@nxgt/openapi-nuxt': minor
---

New package: a Nuxt module for the generated operations. It serves your
Hono app in Nitro under a prefix (`/api` by default), and auto-imports
`useApi()`, a client bound to your spec. During SSR, `useApi()` calls the app
in process, carrying the incoming request's cookies and headers; in the
browser, it calls the same origin.
