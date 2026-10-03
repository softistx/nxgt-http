# Troubleshooting

Each entry is headed by what you see. Every diagnostic code, with its
meaning and fix, is in [Diagnostics](guide/diagnostics.md).

## Specs authored in TypeSpec

What a spec compiled by `@typespec/openapi3` runs into.
[Authoring the spec in TypeSpec](guide/typespec.md) covers the setup.

### `unsupported_version`: the spec is OpenAPI 3.0

**When:** you generate from what `tsp compile` emitted, with no
`openapi-versions` in `tspconfig.yaml`.

**Why:** `@typespec/openapi3` emits OpenAPI 3.0.0 by default, and the
generator reads 3.1 and 3.2 only.

**Fix:** ask for 3.1.

```yaml
# tspconfig.yaml
options:
  '@typespec/openapi3':
    openapi-versions: ['3.1.0']
```

### `` `unevaluatedProperties` with a schema is supported only where it reads the keys `additionalProperties` would ``

**When:** a model both extends another and spreads a `Record<T>`:

```tsp
model Tagged extends Base {
  ...Record<string>;
  name: string;
}
```

**Why:** in 3.1, `Record<T>` becomes `unevaluatedProperties: <T>`, and
`extends` becomes an `allOf` beside it. Next to an `allOf`,
`unevaluatedProperties` also evaluates the keys `Base` declares, and no Zod
object can say that. The generator refuses it at that pointer, with
`unsupported_keyword`. A `Record<T>` on its own, or spread into a model that
extends nothing, works: it becomes `{ [key: string]: T }`.

**Fix:** spread the base instead of extending it.

```tsp
model Tagged {
  ...Base;
  ...Record<string>;
  name: string;
}
```

The declared properties must fit the record's `T`: the model is generated as
`{ id: string; name: string } & { [key: string]: string }`, and with
`Record<int32>` no value could satisfy that type.

### A create body requires `id`, `createdAt` and other read-only properties

**When:** an operation takes the read model as its body:

```tsp
@post create(@body pet: Pet): Pet;
```

**Why:** with implicit visibility, `@typespec/openapi3` reuses `Pet` for the
body and marks its `@visibility(Lifecycle.Read)` properties
`readOnly: true`, still required. `readOnly` has no effect on the generated
code ([Annotations](guide/schema-mapping.md#annotations)), so the request
type and its validator require them.

**Fix:** name the body's visibility. `Create<Pet>` emits `CreatePet`
without them.

```tsp
@post create(@body pet: Create<Pet>): Pet;
@patch update(@path id: string, @body pet: MergePatchUpdate<Pet>): Pet;
```

### A page is typed `PetsList200Response` instead of `PetPage`

**When:** an operation returns a template instance, such as `Page<Pet>`.

**Why:** TypeSpec emits a template instance inline, with no schema name.
The generator names it after the operation and the status.

**Fix:** give the template a name pattern.

```tsp
@friendlyName("{name}Page", Item)
model Page<Item> {
  items: Item[];
  nextCursor?: string;
}
```

### The client's methods are `Pets_list`, and the types `PetsListQuery`

**When:** operations sit in an `interface` and have no `@operationId`.

**Why:** the emitter's default `operation-id-strategy`, `parent-container`,
joins the interface's name and the operation's name with `_`. The generator
names the client's method and the operation's types after that id.

**Fix:** give each operation its id. `@operationId` comes from
`@typespec/openapi`.

```tsp
import "@typespec/openapi";

using OpenAPI;

@route("/pets")
interface Pets {
  @get @operationId("listPets") list(): Pet[];
}
```

### An `int64` above 2^53 is refused, or comes back rounded

**When:** a TypeSpec `int64` carries values past `Number.MAX_SAFE_INTEGER`.

**Why:** `int64` is emitted as `format: int64`, which the generator maps to
`z.int()`, a safe integer
([choices](guide/schema-mapping.md#scalars)). A JSON number that large has
lost precision before any validator sees it.

**Fix:** keep such ids as strings in the spec, for instance
`@format("uuid") id: string`, or a `string` holding the digits. Use `int64`
only for values that stay within 2^53.

## Routes for alxia

What the [`alxia` option](guide/options.md#alxia) runs into.

### `ignored`: `<operationId>: alxia.ts leaves it out. …`

**When:** `alxia.ts` has no constant for an operation of the spec, and
`app.route(operations.x, …)` does not compile.

**Why:** alxia cannot route the operation, or cannot validate what it takes
or replies, yet. The rest of the warning names which:

| The warning goes on | Because |
| --- | --- |
| `alxia has no TRACE routes` | alxia does not route that method |
| `a path parameter must fill its whole segment, and {name}.json does not` | alxia's router reads a parameter as a whole segment |
| `:item-id is not a parameter name it reads` | alxia names a parameter with letters, digits, `_` and `$` |
| `it declares :x twice` | alxia reads each parameter of a path once |
| `… beside /users/{id}: the two match the same requests with other parameter names` | alxia refuses two paths of one shape whose parameters are named apart |
| `Its body is application/octet-stream, which alxia hands over as bytes, unvalidated` | binary bodies are not declared yet |
| `Its 200 reply is application/pdf`, `is JSON Lines`, `is a form` | alxia replies with JSON, text or `eventStream`; the others are not declared yet |
| `streams events alxia cannot send` | alxia's `eventStream` sends unnamed events, each its data as JSON: named events, or events whose data is text, have no schema yet |

**Fix:** where the spec can say it another way, do: give the parameter its
own segment (`/files/{name}`), rename it (`{itemId}`), name the parameters of
paths of one shape alike. Otherwise declare that route with alxia's own
`app.get(path, schema, handler)` beside the generated ones.

### `not_enforced`: `alxia declares one schema per status, so its 200 reply is declared as application/json only, not text/html`

**When:** a body or a reply declares several media types.

**Why:** an alxia route has one `body` schema and one schema per status.
`alxia.ts` keeps `application/json` (or the first JSON type, then the first
form or text type): a body sent as another type is checked against that
schema, and the handler cannot reply as the other type.

**Fix:** declare one media type where you can. To serve several, declare
that route by hand.

### A refused request gets `{ error: 'validation', issues }`, not `ValidationErrorBody`

**When:** a client generated from the same spec reads alxia's 400.

**Why:** alxia answers a request its schemas refuse with its own 400, and
types it on the route itself. `alxia.ts` leaves out the 400 that
[`validationErrors`](guide/options.md#validationerrors) declares, which is
`@nxgt/openapi-hono`'s.

**Fix:** type the client from the alxia app (`@alxia/client` reads the
app's routes, its 400 included), or, for a client generated from the spec,
declare alxia's 400 body in the spec and set `validationErrors: false`.

### `Cannot find module '@alxia/core'` in `alxia.ts`

**When:** an operation replies with server-sent events.

**Why:** `alxia.ts` imports `eventStream` from `@alxia/core` for that reply,
and only then.

**Fix:** add `@alxia/core` to the app's dependencies, as an alxia app
already has it.
