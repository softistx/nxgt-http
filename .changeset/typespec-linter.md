---
'@nxgt/typespec': minor
---

A linter, with the ruleset `@nxgt/typespec/recommended` a spec extends in its `tspconfig.yaml` (`linter: extends: ["@nxgt/typespec/recommended"]`). Its rules are warnings, each one a spec can disable: `list-returns-page` (a `list`, `search` or `query` returns `Page<Item>` or `CursorPage<Item>`, not an array), `service-operation-ids` (a `@service` namespace has `@operationIds`), and `error-body-shape` (an error reply's body is the nxgt envelope, `status`, `message` and `timestamp`). Nothing runs unless the spec extends the set.
