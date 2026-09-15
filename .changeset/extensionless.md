---
'@nxgt/openapi-codegen': minor
---

The generated files import each other without an extension (`'./types'`, not `'./types.js'`): `importExtension` defaults to `''`. An app whose `tsconfig` resolves with `node16` or `nodenext`, or that runs the files with Node without a bundler, sets `importExtension: '.js'` to keep them as they were.
