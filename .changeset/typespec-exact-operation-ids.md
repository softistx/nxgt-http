---
'@nxgt/typespec': minor
---

`@operationIds` now names each operation exactly as written: `@get findPostComments()` is `findPostComments`, where it used to be `<operation><Interface>`. It goes on an interface, or on a namespace to cover every operation in it, however deep; an operation's own `@operationId` still wins. Rename the operations of a marked interface to the ids the client should have, such as `list` to `listPosts`. Ids must be unique per service, not per program: two `@service` namespaces may each have a `health`. An operation template's instances are never named, only the operations declared from them.

The `Resource` template is removed: write a resource's operations by hand, each with its own name. `SortParameters` stays, for the sort of a list.
