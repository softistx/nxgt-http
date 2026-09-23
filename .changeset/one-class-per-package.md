---
'@nxgt/openapi-codegen': patch
'@nxgt/httpyz-query': patch
'@nxgt/httpyz': patch
---

A class is defined once per package, not once per entry point

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
