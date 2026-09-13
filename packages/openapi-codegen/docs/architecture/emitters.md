# Emitters

`emitFiles(ir, options)` (`src/emit/index.ts`) prints four files from one
`EmitContext`:

| File | Printed by |
| --- | --- |
| `types.gen.ts` | `schemaTypes` (`types.ts`), then `operationTypes` (`operations.ts`) |
| `zod.gen.ts` | `emitZod` (`zod.ts`) |
| `operations.gen.ts` | `emitOperations` (`operations.ts`) |
| `paths.gen.ts` | `emitPaths` (`paths.ts`) |

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
- **Every generated name, once.** `XInput` or `XQuery` landing on an existing
  schema's name is a `name_collision`.

## Types (`types.ts`)

- An `interface` when the node is a non-nullable object whose extra keys are
  not a schema. Otherwise a `type` alias.
- An optional property is `?: T | undefined`, which is exactly what Zod
  returns, so the two agree under `exactOptionalPropertyTypes`.
- A `binary` schema node is `globalThis.File`, wherever it is. A whole
  response media type with no schema (`application/pdf`) is
  `globalThis.Blob`. A spec with its own `File` schema cannot shadow either.
- `type(ctx, node, input, indent)` is exported. The operations printer uses it
  for parameters, bodies and responses.

## Zod (`zod.ts`)

- **Order.** Schemas come in the IR's dependency order, so a
  non-recursive schema only ever refers to one already declared.
- **Recursion.** A schema marked `recursive` is annotated
  `z.ZodType<X, XInput>`, imported from `types.gen.ts`. Without that
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
- **Formats.** The table is in `STRING_FORMATS`, and each choice is explained
  in [How schemas map](../guide/schema-mapping.md#scalars).
- **Patterns.** A pattern is printed as a regex literal that matches what
  `new RegExp(pattern)` matches (`regexLiteral`). A `/` outside a character
  class and any line break are escaped.
- **Keys.** `__proto__` is printed as the computed key `['__proto__']`.
  Written plainly in an object literal, it would set the prototype.
- **Imports.** `Scope.uses` records every schema a printed expression names,
  which is how `operations.gen.ts` imports exactly what it uses.

## Operations (`operations.ts`)

- **`Operations`, `OperationIds` and `PathsByMethod`** are plain interfaces
  with no conditional types, so looking up one operation costs TypeScript
  O(1), whatever the size of the spec.
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

## openapi-typescript's shape (`paths.ts`)

- **The contract is openapi-typescript's output**, not its source:
  - `paths[path]` holds the path's `parameters` and the eight classic
    methods, `?: never` where there is none, plus `query` on a path that has
    one;
  - each method points at `operations[operationId]`;
  - every `operations` entry holds `parameters` (`query`, `header`, `path`,
    `cookie`), `requestBody` and `responses[status]` (`headers`, `content`).
- **Header names keep the spec's case** here, as a client writes them,
  unlike the lowercased keys of `operations.gen.ts`.
  `test/types/paths.ts` holds it to that contract through openapi-fetch.
- **Optional wrappers.** A parameter location is optional when nothing in
  it is required. openapi-fetch reads that to decide whether `params` must
  be passed.
- **One type per schema.** Schema types come from `types.gen.ts`, not
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
