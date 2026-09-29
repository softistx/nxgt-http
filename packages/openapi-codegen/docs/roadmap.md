# Roadmap

A direction, not a commitment. The only number on this page is the version
something shipped in; [`CHANGELOG.md`](../CHANGELOG.md) holds the full
history.

## Now

- **Specs authored in TypeSpec** — a spec written in TypeSpec and compiled to
  OpenAPI 3.1 by `@typespec/openapi3` generates types, validators and routes
  like any other: such a project is one of the generator's fixtures, compiled,
  generated, type-checked and served by `@nxgt/openapi-hono` in CI, and
  [`guide/typespec.md`](guide/typespec.md) walks through the pipeline. A
  schema-valued `unevaluatedProperties`, which is how TypeSpec's `Record<T>`
  reaches OpenAPI 3.1, is read as `additionalProperties`.

## Next

- **`@nxgt/typespec`** — a TypeSpec library, in its own package, so a spec
  gets the nxgt conventions by declaring them: the error envelope and the
  standard error responses, cursor and offset pagination, bearer and
  cookie-session auth, CRUD resource templates with filter, sort and field
  selection, common scalars, and idempotency, ETag and rate-limit headers —
  each proven through the same compile, generate, type-check and serve path.

## Later

- **A native TypeSpec emitter** — TypeSpec compiled straight to the
  generator's output, without going through OpenAPI. Decided once the
  TypeSpec → OpenAPI 3.1 path has been used in practice.
- **Input types without `readOnly` properties** — a request body type that
  leaves out what the server sets. Today `readOnly` has no effect, so a
  TypeSpec body with implicit visibility requires those properties; declare
  the body as `Create<T>` meanwhile.
- **Tuples** — `prefixItems` and `items` as a list, refused today as not
  supported yet.

## Not planned

- **`not`, `if` / `then` / `else`, `dependentSchemas`, `dependentRequired`,
  `patternProperties`, `propertyNames`, `contains`, `unevaluatedItems`** —
  they have no faithful type; the generator refuses them rather than
  approximate them silently.
- **`unevaluatedProperties: false` over `anyOf`** — a value may match several
  variants and use keys from each, so no strict object is faithful. Use
  `oneOf`.
- **A keyword beside `oneOf` or `anyOf` that binds only some variants**
  (`minLength`, `enum`…) — write it in each variant.
- **`default` and `4XX` responses** — replies are typed by exact status; these
  are ignored, with a warning.
- **OpenAPI 3.0 and Swagger 2.0 input** — convert the document to OpenAPI 3.1
  or 3.2.

## Shipped

- **A class defined once per package, not once per entry point** — 0.4.1.
- **`c.env` typed in route handlers**, from the app's `Hono<E>` — 0.4.0.
- **Generated imports without an extension**, `importExtension: '.js'` to
  keep them — 0.4.0.
- **The 400 a refused request gets, declared on every operation that takes
  input** (`ValidationErrorBody`, `validationErrors` option) — 0.3.0.
- **Licensed MIT** — 0.2.1.
- **`ClientOperations` in `types.ts`**, typing a client call's arguments and
  every reply — 0.2.0.
- **An `operations` table that types a client on its own** — 0.2.0.
- **Streamed replies an item at a time**, from OpenAPI 3.2's `itemSchema`
  (server-sent events and JSON Lines) — 0.2.0.
- **The Hono runtime in its own package**, `@nxgt/openapi-hono` — 0.2.0.
- **Types, Zod 4 validators, an operations table and a `paths` type from an
  OpenAPI 3.1 or 3.2 document** — 0.1.0.
