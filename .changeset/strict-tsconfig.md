---
"@nxgt/datasource-rest": patch
"@nxgt/httpyz": patch
"@nxgt/openapi-codegen": patch
"@nxgt/openapi-msw": patch
---

Build and type-check under a stricter `tsconfig` — `exactOptionalPropertyTypes`, `noPropertyAccessFromIndexSignature`, `noUnusedLocals` and the rest — so the published declarations compile under any of them in an application. One thing the built JavaScript does differently: class fields are defined as JavaScript defines them (`useDefineForClassFields`), so an error's fields — those of `ClientError` and each error under it, `ReplyStatusError`, `DataSourceError`, `MockReplyError` and `CodegenError` — are its own properties from construction, listed in the order they are declared. Their values are unchanged.
