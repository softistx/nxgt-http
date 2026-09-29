---
'@nxgt/typespec': minor
---

Name `Resource`'s item operations after the item: `readPost`, `createPost`, `updatePost` and `deletePost`, with `list` still named after the interface, `listPosts`. The item's name is its `@friendlyName`, if it has one. This renames the generated client's methods and their types' prefix, from `readPosts` to `readPost`. Two resources of one item now share those ids, which is a `duplicate-operation-id` error: give the second its own `@operationId`s.
