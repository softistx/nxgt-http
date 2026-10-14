---
'@nxgt/openapi-codegen': minor
---

A property marked `readOnly` is the server's to set, so a client no longer has to send it. New option `readOnly: 'omit' | 'keep'` (config file key and `generate()` option), default `'omit'`: each request body uses a `<Name>Write` view of its schema without the `readOnly` properties (nested objects, `allOf` parts and arrays included), while responses keep the schema as written. A schema only request bodies use is stripped in place, so no `Write` copy is emitted. A `readOnly` field sent anyway is absent from the write schema, and `unknownKeys` decides what happens to it. A derived name that clashes with another schema is an error that says to rename the source schema with `names`.

`readOnly: 'omit'` is the default and changes the generated code of specs that mark properties `readOnly`: request bodies use a `<Name>Write` view without them, so the operations table and the hono/msw/httpyz request checks no longer refuse a body without its readOnly fields. Pass `readOnly: 'keep'` to keep the previous output.
