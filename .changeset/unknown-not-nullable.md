---
'@nxgt/openapi-codegen': patch
---

A schema whose `type` lists every type plus `null` is now `{ kind: 'unknown' }` in the IR, no longer `unknown` marked `nullable`. The generated code reads `unknown` and `z.unknown()` instead of `unknown | null` and `z.unknown().nullable()`. Both accept the same values, since `unknown` already takes `null`.
