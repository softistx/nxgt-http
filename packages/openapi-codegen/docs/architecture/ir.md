# Intermediate representation

`buildIR(doc, options)` (`src/ir/index.ts`) reads what a loaded spec means and
reduces every way JSON Schema has of saying a thing to one shape. The types
are in `src/ir/types.ts`. They are the contract between the loader and the
emitters.

```ts
interface ApiIR {
	openapi: string; // as written: '3.2.0'
	version: '3.1' | '3.2';
	title?: string; // info.title
	apiVersion?: string; // info.version
	schemas: NamedSchema[]; // dependencies first
	aliases: Alias[];
	operations: OperationIR[];
	warnings: Diagnostic[];
}
```

## Schema nodes

| `kind` | Carries | From |
| --- | --- | --- |
| `ref` | `target`: a named schema's id | every `$ref` |
| `string` | `format`, `minLength`, `maxLength`, `pattern` | `type: string` |
| `number` | `integer`, `format`, the bounds, `multipleOf` | `type: integer`, `number` |
| `boolean`, `null`, `unknown`, `never` | nothing more | `type`, `{}`, `false` |
| `binary` | nothing more | `format: binary`, non-text `contentMediaType` |
| `literal` | `values` | `enum`, `const` |
| `array` | `items`, `minItems`, `maxItems` | `type: array` |
| `object` | `properties`, `additional`, `extends`, `requires` | `type: object`, `allOf` of objects |
| `record` | `values` | an object that declares no properties |
| `union` | `variants`, `exclusive`, `discriminator` | `oneOf`, `anyOf`, a list of types |
| `intersection` | `members` | any other `allOf` |

Every node also carries `Annotations`: `nullable`, `description`,
`deprecated`, `readOnly`, `writeOnly`, and `default`, boxed as `{ value }`
because `null` is a real default.

## Normalization (`src/ir/schemas.ts`, `SchemaBuilder`)

- **Null has one spelling.** `type: [T, 'null']`, a `null` in `enum`, a
  `{ type: 'null' }` variant and 3.0's `nullable: true` all become
  `nullable: true` on the node.
- **Types.** `[integer, number]` is `number`. All five non-null types together
  are `unknown`. Several types are a non-exclusive union. No `type` at all is
  inferred from the keywords present (`properties` means object, `items`
  means array…), or `unknown`.
- **`allOf` over objects** becomes one object with `extends: [parent ids]`
  and the merged own properties. A `required` next to `allOf` that names a
  parent's property becomes `requires`. After every schema is built,
  `#checkExtends` turns an object whose parent is not an object (a union, a
  nullable schema) into an in-place intersection.
- **`$ref` with siblings** means both, as `allOf: [$ref, rest]` would.
  Annotation-only siblings (`description`, `nullable`…) stay on the `ref`
  node.
- **A union with `properties` beside it** becomes an intersection of the
  object and the union.
- **Discriminators** are checked once every schema exists
  (`#checkDiscriminators`). Every variant must resolve to an object with the
  property required and a literal, with no literal shared between variants.
  Otherwise the discriminator is dropped with a `discriminator_fallback`
  warning.
- **Refusals** (`UNSUPPORTED_KEYWORDS`, tuples, boolean exclusive bounds, bad
  patterns) are errors at the keyword's own pointer.

## Names

A schema gets a name when it is a `components.schemas` entry, a `$ref`
target, or a body or response object written inline. Everything else stays
inline where it is used.

| Schema | Name |
| --- | --- |
| component | its key, PascalCased |
| `$ref` target | the last pointer token, or the file's basename |
| inline body | `${OperationId}Body` |
| inline response | `${OperationId}${status}Response` |
| body or response reached through `$ref` | named after itself: `NotFoundResponse` |
| second structured media type of the same body | a numeric suffix |

Components are registered before anything else, so a component's key wins
the name of the schema it points at. A second key pointing at an already
named schema becomes an `Alias`. The `names` option overrides by
`file[#pointer]`, relative to the root document. Two schemas claiming one name
are a `name_collision` error that spells out the override.

**A `$ref` is never inlined.** It becomes a `ref` node, and its target is
queued and built later by `drain()`. That is what makes a fragment shared by
forty files one schema, and what lets recursion be detected instead of
unrolled.

## Order and recursion (`src/ir/graph.ts`)

`finalize()` runs Tarjan's strongly connected components over the
schema-to-schema edges (`refsOf`). The components come out in dependency
order, which is the emit order. A schema in a component of more than one
node, or one that reaches itself, is marked `recursive`.

## Operations (`src/ir/operations.ts`)

- **Methods.** The eight classic ones, plus `query` when the document is 3.2.
  `additionalOperations` is refused.
- **Parameters.** The path item's parameters are merged with the
  operation's, and the operation's win. Keys are `in:name`, lowercased for
  headers.
  - Each parameter must use its location's style: `simple` for path and
    header, `form` for query.
  - `explode` defaults to `style === 'form'`.
  - Path parameters are always required.
  - `Accept`, `Content-Type` and `Authorization` header parameters are
    dropped, as OpenAPI specifies.
- **`operationId`.** A missing one is derived as `method` + PascalCased path
  segments + `By<Param>`, with a warning. A duplicate is an error.
- **Path template.** `{name}` in the path and the `in: path` parameters must
  match exactly.
- **Bodies and responses.** Media types are classified as `json` (`application/json`,
  `application/*+json`), `form` (urlencoded, multipart), `text` (`text/*`) or `binary`.
  Only `json` and `form` schemas are named. Responses are exact status codes;
  `default` and `NXX` are ignored with a warning.
- **`checkParameters`** runs after every schema is built, since a parameter's
  schema may be a `$ref`. Each must resolve to a scalar, an enum, a union of
  those, or a list of them, and a list is not allowed in the path.
