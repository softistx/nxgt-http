---
'@nxgt/typespec': minor
---

Add the scalars `uuid` (the schema `Uuid`, `format: uuid`) and `email` (the schema `Email`, `format: email`), and the columns `@nxgt/drizzle` stamps a row with, as models to spread: `Timestamps` (`createdAt`, `updatedAt`), `SoftDelete` (`deletedAt`), `Versioned` (`version`, sent back in an update) and `Actors<Id = uuid>` (`createdBy`, `updatedBy`, `deletedBy`), read-only except `version`.
