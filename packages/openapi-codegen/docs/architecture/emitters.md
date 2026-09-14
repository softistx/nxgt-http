# Emitters

`emitFiles(ir, options)` (`src/emit/index.ts`) prints four files from one
`EmitContext`, and a fifth with the `hono` option:

| File | Printed by |
| --- | --- |
| `types.ts` | `schemaTypes` (`src/emit/types.ts`), then `operationTypes` (`src/emit/operations.ts`) |
| `zod.ts` | `emitZod` (`src/emit/zod.ts`) |
| `operations.ts` | `emitOperations` (`src/emit/operations.ts`) |
| `paths.ts` | `emitPaths` (`src/emit/paths.ts`) |
| `hono.ts` | `emitHono` (`src/emit/hono.ts`), with `hono` only |

Code is printed as text, with no TypeScript compiler API. That keeps the
generator independent of the compiler version its consumers run.

## `EmitContext` (`context.ts`)

What both printers must agree on, computed once:

- **Which schemas need an `XInput` type.** A schema needs one when a
  property's default is filled in (`appliesDefault`: optional, with a
  `default`), or when it reaches such a schema. This is a fixpoint, because
  schemas reach each other in cycles.
- **The unknown-key mode of an object** (`mode`): the spec's
  `additionalProperties`, else the `unknownKeys` option. Intersection
  members keep theirs (below).
- **What is not enforced** (`warnings`), which `generate` returns beside the
  IR's warnings.
- **Whether a node's validator is a `ZodObject`** (`isZodObject`). That
  decides between `.extend()` and `.and()`, and between
  `z.discriminatedUnion` and `z.union`.
- **Parameter groups** (`paramGroups`): an operation's path, query and header
  parameters, each validated as one object named `${Op}Param`, `${Op}Query`
  or `${Op}Header`.
- **Every generated name, once.** `XInput`, `XQuery` or `XForm` landing on an
  existing schema's name is a `name_collision`. So is a schema named like
  what the files declare themselves: `Operations` and its four indexes,
  `Wire` with `dates: 'date'`, and, with `hono`, `Replies`, `HonoSpec` and
  `Hono`. Two interfaces of one name
  would merge silently, not fail.

## Types (`src/emit/types.ts`)

- An `interface` when the node is a non-nullable object whose extra keys are
  not a schema. Otherwise a `type` alias.
- An optional property is `?: T | undefined`, which is exactly what Zod
  returns, so the two agree under `exactOptionalPropertyTypes`.
- A `binary` schema node is `globalThis.File`, wherever it is. A whole
  response media type with no schema (`application/pdf`) is
  `globalThis.Blob`. A spec with its own `File` schema cannot shadow either.
- `type(ctx, node, input, indent)` is exported. The operations printer uses it
  for parameters, bodies and responses.
- **Enums.** A schema that `ctx.enumOf` accepts (a named `enum` of two or
  more strings or numbers, with `enums: 'object'`) prints as
  `export const X = { … } as const` beside `type X`. `enumKeys` names the
  members, and an alias of one re-exports the object.
  - The type is the union of the object's values, so it agrees with
    `z.enum(X)` and still accepts plain literals.
  - There is no TypeScript `enum`: it is nominal, and `erasableSyntaxOnly`
    refuses it.

## Zod (`src/emit/zod.ts`)

- **Order.** Schemas come in the IR's dependency order, so a
  non-recursive schema only ever refers to one already declared.
- **Recursion.** A schema marked `recursive` is annotated
  `z.ZodType<X, XInput>`, imported from `types.ts`. Without that
  annotation TypeScript cannot type the cycle and falls back to `any`.
  - A property that reaches a schema not yet initialized becomes a getter,
    which Zod reads only when it needs the shape.
  - Any other such reference becomes `z.lazy(() => zX)`.
  - An annotated schema is typed `ZodType`, not `ZodObject`. So an object
    that extends it is printed as `.and()`, and a union over it as
    `z.union`.
- **`allOf` over objects** prints `zFirst.extend(zNext.shape).extend({ own })`.
  `.extend()` keeps the first parent's unknown-key mode, so when the child's
  differs it is restated with `.strip()`, `.strict()`, `.loose()` or
  `.catchall()`.
- **Intersections.** Each member of a Zod intersection parses the whole
  input, and the intersection reports an unknown key only when every member
  does. So a member keeps its own mode.
  - Under `unknownKeys: 'strict'`, every member is strict, and the
    intersection refuses exactly the keys that no member declares.
  - Zod 4.4.3 refused valid values that passed through a union of strict
    objects. That is why the `zod` peer starts at 4.5.4.
  - An `additionalProperties: false` on a member whose siblings strip
    refuses nothing, and its extra keys are dropped. The same happens to a
    strict parent under `.extend()`, which takes the child's mode. JSON
    Schema would refuse those keys, so `#findLoosened` adds a
    `not_enforced` warning.
- **Defaults.** An object or array default is printed as a closure,
  `.default(() => ({}))`, so no two parses share one mutable value.
- **Enums.** An enum object prints as `z.enum(X)` over the object it imports,
  as a value, from `types.ts`. It gets `.nullable()` when the enum lists
  `null`. Parameter validators reach it through `zX` like any other named
  schema: `numeric.pipe(zTier)` for numbers.
- **Formats.** The table is in `STRING_FORMATS`, and each choice is explained
  in [How schemas map](../guide/schema-mapping.md#scalars).
- **Dates.** With `dates: 'date'`, `ctx.isDate` marks each `date-time`.
  - Its validator becomes `z.codec(<string>, z.date(), isoDate)`, and the
    file declares `isoDate` once when one is used (`Scope.helpers`).
  - `inputDiffers` counts it, so every schema that reaches it gets an
    `XInput`.
  - `ctx.datesIn` is a second fixpoint, over values holding a `Date`. It
    decides `.prefault()` over `.default()` (`withDefault`), because a spec
    writes a default as JSON. It also decides where `ctx.wire` wraps a type
    in `Wire<T>`.
- **Patterns.** A pattern is printed as a regex literal that matches what
  `new RegExp(pattern)` matches (`regexLiteral`). A `/` outside a character
  class and any line break are escaped.
- **Keys.** `__proto__` is printed as the computed key `['__proto__']`.
  Written plainly in an object literal, it would set the prototype.
- **Imports.** `Scope.uses` records every schema a printed expression names,
  which is how `operations.ts` imports exactly what it uses.

## Operations (`src/emit/operations.ts`)

- **`Operations`** is keyed by `operationId` and holds what a handler gets:
  parameters and bodies as validated, and the replies. What a caller sends
  is in `paths.ts`, so the map carries no second, input-side copy.
- **`OperationsByRoute`, `PathsByMethod`, `OperationsByTag` and
  `PathsByTag`** index it: from `'put /employees/{id}'`, from a method, from
  a tag. All are plain interfaces with no conditional types, so looking up
  one operation costs TypeScript O(1), whatever the size of the spec.
- **The runtime table** is annotated
  `{ readonly [K in keyof Operations]: OperationSpec }`, not inferred. An
  inferred table would carry a literal type for every validator of every
  operation. The precise types are in `Operations`.
- **Parameters arrive as text.** Their validators read numbers through a
  `numeric` helper (a strict number regex, then `Number`) and booleans
  through `flag`, a `z.stringbool` limited to `true` and `false`, in any
  case. The helpers are declared only when used, so a consumer with
  `noUnusedLocals` stays clean.
  - `z.coerce.number()` is not used, because it reads `''` and `' '` as `0`.
  - A mixed enum (`[1, 2, max]`) becomes a union of a numeric piece and a
    string piece.
- **Headers** are keyed by lowercased name, as Hono and the Fetch `Headers`
  object read them.
- **Form bodies** get a validator of their own, `z<Operation>Form`.
  - A form carries text and files, so each field is read like a parameter.
  - A list field takes a lone value as a list of one (the `repeated`
    helper).
  - Only a flat object qualifies (`ctx.formOf`): no `allOf` parent, and no
    schema for extra keys. Any other form schema is validated as written.

## Hono (`src/emit/hono.ts`)

Written only with the `hono` option.

- **`Replies`** is keyed by `operationId`. Each entry is the union of what
  the operation may send, as Hono's `TypedResponse`:

  | Response | Reply |
  | --- | --- |
  | JSON | `TypedResponse<T, status, 'json'>` |
  | text | `TypedResponse<T, status, 'text'>`, `string` without a schema |
  | binary, or any other media type | `TypedResponse<unknown, status, 'body'>`, for `c.body()` |
  | no content | `TypedResponse<null, status, 'body'>`, plus `TypedResponse<undefined, status, 'redirect'>` for a 3xx other than 304 |
  | no exact status at all | `Response` |

  A status that Hono's `StatusCode` does not name is typed `any`, with a
  `not_enforced` warning.
- **`HonoSpec`** gathers `Operations`, `Replies` and the four indexes. The
  runtime's types read nothing else.
- **Imports are namespaced:** `import type * as Hono from 'hono'` and
  `import * as runtime from '@nxgt/openapi-codegen/hono'`. Schema types are
  imported by name, so `Replies`, `HonoSpec` and `Hono` are claimed in
  `#checkNames`, as a schema's name would be.

## openapi-typescript's shape (`src/emit/paths.ts`)

- **The contract is openapi-typescript's output**, not its source:
  - `paths[path]` holds the path's `parameters` and the eight classic
    methods, `?: never` where there is none, plus `query` on a path that has
    one;
  - each method points at `operations[operationId]`;
  - every `operations` entry holds `parameters` (`query`, `header`, `path`,
    `cookie`), `requestBody` and `responses[status]` (`headers`, `content`).
- **Header names keep the spec's case** here, as a client writes them,
  unlike the lowercased keys of `operations.ts`.
  `test/types/paths.ts` holds it to that contract through openapi-fetch.
- **Optional wrappers.** A parameter location is optional when nothing in
  it is required. openapi-fetch reads that to decide whether `params` must
  be passed.
- **One type per schema.** Schema types come from `types.ts`, not
  reprinted. `ctx.collectTypes` records every name `typeName` gives out while
  the file prints, so the file imports exactly those and stays clean under
  `noUnusedLocals`.

## Layout

`printer.ts` holds the helpers:

- `jsString`, which single-quotes strings;
- `propertyKey`;
- `jsValue`, which prints JSON as JavaScript;
- `docComment` and `docLines`;
- `list`, which keeps short lists on one line and breaks long ones one item
  per line;
- `group`, which adds parentheses where precedence needs them.

The output is readable and tab-indented, but not formatted by any particular
formatter. Consumers should exclude it from theirs.
