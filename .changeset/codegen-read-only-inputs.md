---
'@nxgt/openapi-codegen': minor
---

A property marked `readOnly` is the server's to set, so a client no longer has to send it. New option `readOnly: 'omit' | 'keep'` (config file key and `generate()` option), default `'omit'`: each request body uses a `<Name>Write` view of its schema without the `readOnly` properties (nested objects, `allOf` parts and arrays included), while responses keep the schema as written. A schema only request bodies use is stripped in place, so no `Write` copy is emitted. A `readOnly` field sent anyway is absent from the write schema, and `unknownKeys` decides what happens to it. A derived name that clashes with another schema is an error that says to rename the other schema with `names`.

`readOnly: 'omit'` is the default and changes the generated code of specs that mark properties `readOnly`: request bodies use a `<Name>Write` view without them, so the operations table and the hono/msw/httpyz request checks no longer refuse a body without its readOnly fields. Pass `readOnly: 'keep'` to keep the previous output.

A property marked `writeOnly` is the client's to set (a password), so a server no longer has to send it. New option `writeOnly: 'omit' | 'keep'` (config file key and `generate()` option), default `'omit'`, the mirror of `readOnly`: each response uses a `<Name>Read` view of its schema without the `writeOnly` properties (nested objects, `allOf` parts, arrays, and a stream's items and events included), while request bodies keep the schema as written. A schema only responses use is stripped in place, so no `Read` copy is emitted; a schema with both kinds of property gets `<Name>Write` and `<Name>Read`. A derived name that clashes with another schema is an error that says to rename the other schema with `names`.

`writeOnly: 'omit'` is the default and changes the generated code of specs whose responses carry `writeOnly` properties: the client's reply types, a Hono handler's response, `validateResponses`, the response validators of the operations table and the msw mocks' replies use a `<Name>Read` view without them, so a reply without its `writeOnly` fields is no longer refused. Pass `writeOnly: 'keep'` to keep the previous output.

Breaking for specs that use `readOnly` or `writeOnly`:

- A named schema used in only one direction is stripped in place, so its type loses those fields: a request-only `Draft` loses its `readOnly` field, a reply-only `Receipt` its `writeOnly` one.
- A generate that passed before fails with a `name_collision` when the spec already has a schema named `<Name>Write` or `<Name>Read`; rename one with `names`.
- With `unknownKeys: 'strict'`, a body sent back as received from a GET (carrying a `readOnly` `id`) is now refused (400).
- `paths.ts`' `components.schemas` gains the view entries (`PetWrite`, `PetRead`).
- `readOnly: 'keep'` and `writeOnly: 'keep'` restore the previous output.
