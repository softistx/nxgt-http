---
---

Internal only: `printer.ts` imports `IDENTIFIER` from `ir/naming` instead of keeping a copy, and a nested `packages/openapi-nuxt/biome.json` turns off the unused-binding rules for `.vue` files (Biome cannot see template usage). No published output changes.
