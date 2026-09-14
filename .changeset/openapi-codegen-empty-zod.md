---
'@nxgt/openapi-codegen': patch
---

A spec with no schema no longer generates a `zod.ts` that imports `z` without using it, which an app built with `noUnusedLocals` refused. The file is now an empty module. Every file the generator writes is checked with the strictest TypeScript settings, on every fixture.
