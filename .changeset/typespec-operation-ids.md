---
'@nxgt/typespec': minor
---

Add `@operationIds`: on an interface, it names each operation `<operation><Interface>` (`listPosts` instead of `Posts_list`), unless the operation has its own `@operationId`, and refuses two operations named alike with `duplicate-operation-id`. `@typespec/openapi` becomes a peer dependency.
