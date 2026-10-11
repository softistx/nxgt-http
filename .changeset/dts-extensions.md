---
"@nxgt/httpyz": patch
"@nxgt/httpyz-query": patch
"@nxgt/openapi-codegen": patch
"@nxgt/openapi-hono": patch
"@nxgt/openapi-httpyz": patch
"@nxgt/openapi-msw": patch
"@nxgt/openapi-nuxt": patch
"@nxgt/datasource-rest": patch
"@nxgt/typespec": patch
---

Types resolve under `moduleResolution: nodenext` (and `node16`). The published `.d.ts` files imported their siblings without an extension (`from './client/types'`), which those resolutions do not follow in an ES module package, so `HttpClient`, `HttpClientOptions` and every other type read through such an import were `any` there, and `skipLibCheck: true` hid it. The declarations now name their files (`./client/types.js`); `bundler` resolution reads them the same. A project that builds on these types under nodenext gets real checking, so it may report errors it did not before.
