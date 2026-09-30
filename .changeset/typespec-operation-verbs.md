---
'@nxgt/typespec': minor
---

`@operationIds` completes a known verb with the interface's resource: in `interface Users`, `list` is `listUsers`, `create` is `createUser`, and `findById` is `findUserById`. The plural verbs are `list`, `read`, `find`, `search`, `count`, `createMany`, `updateMany` and `deleteMany`. The singular verbs are `get`, `create`, `update`, `patch`, `replace`, `upsert` and `delete`. Any verb followed by `By…` takes the singular before `By`.

The resource's plural is the interface's name, and its singular comes from a short English rule (`Categories` → `Category`, `People` → `Person`). `@operationIds(#{ singular: "Member" })` names an interface's resource, and `#{ verbs: #{ archive: "singular" } }` adds verbs, on an interface or a namespace. Any other name, and any operation outside an interface, keeps its id as written.

An operation of a marked interface named exactly `list`, `create` or another of these verbs gets a new id: give it an `@operationId` to keep the old one.
