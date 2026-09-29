---
'@nxgt/typespec': minor
---

Add `Resource<Item, Filters = {}, SortField = "id", Id = uuid>`, an interface template with the five operations of a resource (`list`, paged by offset with the spec's typed filters and a sort; `read`; `create`; `update`, a merge patch; `delete`), named by `@operationIds`, and `SortParameters<Field>`: the query `orderBy`, one of the fields named, and `direction`, `asc` or `desc`, as `@nxgt/drizzle` sorts.
