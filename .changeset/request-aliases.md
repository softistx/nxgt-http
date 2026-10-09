---
'@nxgt/typespec': minor
---

`CreateRequest<T>`, `UpdateRequest<T>` and `PatchRequest<T>`: TypeSpec's `Create`, `Update` and `MergePatchUpdate`, named `Create<T>Request`, `Update<T>Request` and `Patch<T>Request`. The `tsp init` template now uses all three: `update` replaces a user with a `PUT`, `patch` changes some of it with a merge patch.
