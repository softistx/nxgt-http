# How schemas map

Each JSON Schema construct is generated faithfully, refused with an error, or
accepted with a warning that says what is not enforced. Nothing is
approximated silently.

## Scalars

| JSON Schema | TypeScript | Zod |
| --- | --- | --- |
| `type: string` | `string` | `z.string()` |
| `minLength`, `maxLength`, `pattern` | | `.min()`, `.max()`, `.regex()` |
| `format: date-time` | `string` | `z.iso.datetime({ offset: true })` |
| `format: date-time`, with [`dates: 'date'`](options.md#dates) | `Date`; `string` in `XInput` | `z.codec(z.iso.datetime({ offset: true }), z.date(), isoDate)` |
| `format: date`, `time`, `duration` | `string` | `z.iso.date()`, `z.iso.time()`, `z.iso.duration()` |
| `format: email`, `uri` | `string` | `z.email()`, `z.url()` |
| `format: uuid` | `string` | `z.guid()` |
| `format: ipv4`, `ipv6` | `string` | `z.ipv4()`, `z.ipv6()` |
| `format: byte`, `contentEncoding: base64` | `string` | `z.base64()` |
| `format: binary`, a non-text `contentMediaType` | `globalThis.File` | `z.file()` |
| any other string `format` | `string` | `z.string()`, with an `unknown_format` warning |
| `type: integer` | `number` | `z.int()`; `format: int32` gives `z.int32()`, any other format is ignored |
| `type: number` | `number` | `z.number()` |
| `minimum`, `maximum` | | `.min()`, `.max()` |
| `exclusiveMinimum`, `exclusiveMaximum` | | `.gt()`, `.lt()` |
| `multipleOf` | | `.multipleOf()` |
| `type: boolean` | `boolean` | `z.boolean()` |
| `{}`, `true` | `unknown` | `z.unknown()` |
| `false` | `never` | `z.never()` |

Some of these choices are deliberate:

- **`date-time` is a string** by default, as it is on the wire, and RFC 3339
  requires the offset. `2024-01-01T00:00:00Z` passes; `2024-01-01T00:00:00`
  does not. [`dates: 'date'`](options.md#dates) decodes it to a `Date` after
  the same check. `format: date` stays a string: a day is not an instant.
- **`uuid` is `z.guid()`.** JSON Schema's `uuid` is the 8-4-4-4-12 shape.
  `z.uuid()` would also refuse ids whose version and variant bits are not
  RFC 9562's.
- **`int64` is `z.int()`**, a safe integer. A JSON number past 2^53 has lost
  precision before any validator sees it.

## Null, literals and lists

| JSON Schema | TypeScript | Zod |
| --- | --- | --- |
| `type: [string, 'null']` | `string \| null` | `z.string().nullable()` |
| `enum: [a, b, null]`, inline or with `enums: 'union'` | `'a' \| 'b' \| null` | `z.enum(['a', 'b']).nullable()` |
| `type: string` beside `enum: [a, null]` | `'a'`: both apply, so `null` is out | `z.literal('a')` |
| `enum: []` | `never` | `z.never()` |
| `oneOf: [{ $ref: X }, { type: 'null' }]` | `X \| null` | `zX.nullable()` |
| 3.0's `nullable: true` | `T \| null` | `.nullable()`, with a `legacy_nullable` warning |
| a named `enum` of strings or numbers | `const X = { A: 'a', B: 'b' } as const` and `type X = 'a' \| 'b'` | `z.enum(X)` |
| `enum` of strings, inline or with [`enums: 'union'`](options.md#enums) | `'a' \| 'b'` | `z.enum(['a', 'b'])` |
| `x-enum-varnames`, `x-enumNames` | the members' names in `X` | |
| `const: 1`, an `enum` with a boolean, an inline mixed `enum` | `1`, `'a' \| 1` | `z.literal(1)`, `z.literal(['a', 1])` |
| `type: [string, number]` | `string \| number` | `z.union([z.string(), z.number()])` |
| `type` listing every type but `null` | their union: `null` is refused | `z.union([…])` |
| `minItems`, `maxProperties`… with no `type` | | not enforced: `not_enforced` warning; give the schema a `type` |
| `type: array`, `items: T` | `T[]` | `z.array(T)` |
| `minItems`, `maxItems` | | `.min()`, `.max()` |
| `uniqueItems` | | not enforced: `not_enforced` warning |

An enum object's members are named by `x-enum-varnames` (or `x-enumNames`).
It must list one distinct identifier per value, `null` included, or the run
fails with `invalid_schema`. Without either extension, each value is
PascalCased:

| Values | Members |
| --- | --- |
| `active`, `on_leave`, `a-b` | `Active`, `OnLeave`, `AB` |
| `2fa`, and `1`, `-1`, `1.5` | `_2fa`, and `_1`, `_Minus1`, `_1_5` |
| `Active` beside `active` | `Active`, `Active2` |
| `''` | `Empty` |

## Objects

| JSON Schema | TypeScript | Zod |
| --- | --- | --- |
| `properties`, `required` | `interface`; optional as `?: T \| undefined` | `z.object()`; `.optional()` |
| no `additionalProperties` | | per [`unknownKeys`](options.md#unknownkeys), stripped by default |
| `additionalProperties: false` | | `z.strictObject()` |
| `additionalProperties: true` | `[key: string]: unknown` | `z.looseObject()` |
| `additionalProperties: S` beside `properties` | `{ … } & { [key: string]: S }` | `.catchall(S)` |
| `additionalProperties: S` alone, or no `properties` | `{ [key: string]: S }` | `z.record(z.string(), S)` |
| `default` on an optional property | present in `X`, optional in `XInput` | `.default(v)` |
| `minProperties`, `maxProperties` | | not enforced: `not_enforced` warning |
| `required` naming a key no `properties` declares | with an `additionalProperties` schema, a required property of it; else its presence is not checked, with a `not_enforced` warning; beside `additionalProperties: false`, an `invalid_schema` error, since nothing could match | as the type |

## Composition

| JSON Schema | TypeScript | Zod |
| --- | --- | --- |
| `allOf` of objects | `interface X extends A, B` | `zA.extend(zB.shape).extend({ … })` |
| `allOf` with a `required` naming a parent's or a sibling's property, with or without `properties` of its own | that property made required | that property made required |
| a property two `allOf` members declare, or a child restates from its parent | one property holding both schemas (`A & B`, or the one that says more), required if either requires it | the same |
| `allOf` of anything else | `A & B` | `zA.and(zB)`: a key is refused only when every member refuses it |
| `additionalProperties: false` on an `allOf` member whose siblings strip | | not enforced: extra keys are dropped, `not_enforced` warning |
| `additionalProperties: false` on an `allOf` member merged into one object | | JSON Schema would refuse the other members' keys; the merged object accepts them, with a `not_enforced` warning. Write `unevaluatedProperties: false` beside the `allOf` instead |
| `$ref` beside other keywords | as `allOf: [$ref, rest]`; the [refused](#refused) keywords are refused there too | as `allOf` |
| `oneOf`, `anyOf` | `A \| B` | `z.union([zA, zB])` |
| `properties`, `required`, `items`… beside `oneOf` or `anyOf` | applied on top: `Base & (A \| B)`; a `required` every variant already has adds nothing | `zBase.and(z.union(…))` |
| with `discriminator.propertyName` | `A \| B` | `z.discriminatedUnion('kind', [zA, zB])` |
| a schema that reaches itself | a recursive type | annotated `z.ZodType<X, XInput>`, lazy where it must be |

A discriminator is kept only when every variant is an object with that
property required and a constant, distinct in each variant. Otherwise the
union is validated by trying each variant, with a `discriminator_fallback`
warning. A union over a recursive variant is also validated that way, with no
warning: Zod needs the object's shape up front for a discriminated union. It
accepts and refuses the same values; only the error messages differ. `oneOf`'s "exactly one" is not enforced: a value matching two
variants passes.

## Annotations

`description` and `deprecated` become JSDoc on the type. `default` is
documented as `@default`, and filled in when it sits on an optional property.
`readOnly`, `writeOnly`, `title`, `example` and `examples` have no effect on
the generated code.

## `unevaluatedProperties: false`

A key that no part of the schema evaluates is refused:

| Where | Result |
| --- | --- |
| on an object | `z.strictObject()`; nothing changes when `additionalProperties` already allows or validates extra keys. An object that declares no property accepts only `{}`, where it would otherwise be a map of anything |
| on a `oneOf` | each inline variant becomes strict: a key the matching variant does not declare is refused |
| on an `allOf` | each inline member becomes strict: a key no member declares is refused |
| on an `anyOf` | refused: a value may match several variants and use keys from each |
| next to a `$ref`, or over `$ref` members | the referenced schema must refuse unknown keys itself (`additionalProperties: false`, or `unknownKeys: 'strict'`); otherwise a `not_enforced` warning, since its unknown keys are dropped, not refused |

`unevaluatedProperties: true` changes nothing, and a schema as its value is
refused.

## Refused

Each of these is an error at its own pointer, and they are all reported
together:

| Construct | Why |
| --- | --- |
| `not`, `if` / `then` / `else` | no faithful type |
| `dependentSchemas`, `dependentRequired` | no faithful type |
| `patternProperties`, `propertyNames` | no faithful type |
| `unevaluatedItems`; `unevaluatedProperties` with a schema, or over `anyOf` | no faithful type |
| `prefixItems`, `items` as a list (tuples) | not supported yet |
| `contains`, `minContains`, `maxContains` | no faithful type |
| `$dynamicRef`, `$dynamicAnchor`, `$recursiveRef` | not supported |
| `oneOf` and `anyOf` in the same schema | ambiguous |
| any other keyword beside `oneOf` or `anyOf` (`minLength`, `enum`…) | it binds only some variants; write it in each variant |
| a path item `$ref` with fields beside it other than `summary` and `description` | the operations it refers to would be lost; move the fields into that file |
| `openapi: 3.1` unquoted | YAML reads a number: write `"3.1.0"` |
| a boolean `exclusiveMinimum` / `exclusiveMaximum` | OpenAPI 3.0; in 3.1 the keyword is the bound |
| an invalid `pattern` | would throw at runtime |
| an object or array inside `enum` or `const` | not supported |

## Parameters

Parameters are read off a URL or a header, so fewer shapes fit:

| Allowed | Refused |
| --- | --- |
| `in: path`, `query`, `header` | `in: cookie`, `in: querystring` |
| scalars, enums, unions of them | objects, maps, nested lists |
| lists in `query` and `header` | lists in `path` |
| `style: simple` (path, header), `form` (query) | any other `style`, `deepObject` included |
| `schema` | `content` |

`Accept`, `Content-Type` and `Authorization` header parameters are ignored,
as OpenAPI specifies. HTTP carries those itself.

## Form bodies

A `multipart/form-data` or `application/x-www-form-urlencoded` body arrives
as text and files, like parameters. When the first form media type's
schema is a flat object (not nullable, no `allOf` parent, no schema for
extra keys), the operation also gets a `z<Operation>Form` validator that
reads each field from text:

| Field | Read as |
| --- | --- |
| `integer`, `number`, `boolean`, enums | as a [parameter](#parameters) of that type |
| `format: binary` | a `File`, as sent |
| `type: array` | every value of the field; a field sent once is a list of one |
| an object | validated as sent: a form cannot carry one |

Any other form schema is validated as written, by its own `z<Name>`.

## Operations

| Construct | Result |
| --- | --- |
| `get`, `put`, `post`, `delete`, `options`, `head`, `patch`, `trace` | generated |
| `query` (OpenAPI 3.2) | generated; refused in a 3.1 document |
| `additionalOperations` (3.2) | refused |
| a missing `operationId` | derived from method and path (`putEmployeesById`), with a warning |
| a duplicate `operationId` | refused |
| `{name}` in the path with no matching `in: path` parameter, or the reverse | refused |
| an exact status code: `200`, `404` | generated |
| `default`, `4XX` responses | ignored, with a warning: replies are typed by exact status |
| `callbacks`, `webhooks` | ignored, with a warning |
