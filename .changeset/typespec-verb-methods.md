---
'@nxgt/typespec': minor
---

`@operationIds` warns, with `verb-method-mismatch`, when an operation named after one of the library's verbs is sent with a method that verb does not name: `list`, `read`, `find`, `count` and `get` with `GET` or `HEAD`; `search` and `query` with `GET` or `POST`; `create` and `createMany` with `POST`; `update` and `updateMany` with `PUT` or `PATCH`; `patch` with `PATCH`; `replace` and `upsert` with `PUT`; `delete` with `DELETE`, and `deleteMany` with `DELETE` or `POST`. A `By…` name takes its verb's methods. `#suppress "@nxgt/typespec/verb-method-mismatch"` silences one operation.

`query` is a new plural verb: `query` in `Users` is `queryUsers`. An operation already named `query` in a marked interface gets that new id; give it an `@operationId` to keep the old one.
