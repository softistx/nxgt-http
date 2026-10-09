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

### `ignored`: `x-nxgt-method: query marks a POST as a QUERY, not a GET`

**When:** an operation carries `x-nxgt-method: query` and is not a `post`,
for instance a `@get` marked with `@nxgt/typespec`'s `@queryMethod` (the
compiler refuses that with `query-method-not-post`), or a spec written by
hand. The method in the message is the operation's.

**Why:** the key says a `POST` is a `QUERY`; on another method there is
nothing to mark, and the operation is generated as it is.

**Fix:** make the operation a `post`, or remove the key. A `GET` needs no
mark, and an OpenAPI 3.2 document can declare a real `query` operation.

### `ignored`: `x-nxgt-method takes only query: "search" is not it`

**When:** an operation carries `x-nxgt-method` with a value other than
`query`.

**Why:** `query` is the only value the generator reads; the operation is
generated as it is.

**Fix:** write `x-nxgt-method: query` on a `post`, or remove the key.

```yaml
/users/search:
  post:
    operationId: searchUsers
    x-nxgt-method: query
```

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
| `` streams the event `ping` with text data `` | alxia's `eventStream` sends every event's data as JSON, so an event whose `data` has no `contentMediaType: application/json` and `contentSchema` cannot be sent as the spec says |
| `streams events it does not declare` | the reply has a `schema` but no `itemSchema` naming its events: alxia sends each event from a schema |
| `` streams an event named "", which alxia's eventStream refuses `` | an event name that is empty or holds a line break or a NUL, which alxia's `eventStream` throws on |

**Fix:** where the spec can say it another way, do: give the parameter its
own segment (`/files/{name}`), rename it (`{itemId}`), name the parameters of
paths of one shape alike, give each event's data a JSON `contentSchema`.
Otherwise declare that route with alxia's own
`app.get(path, ...middlewares, handler)` beside the generated ones, and
leave it to `matchesSpec`'s `exclude` from `@alxia/openapi`.

### `not_enforced`: `alxia declares one schema per status, so its 200 reply is declared as application/json only, not text/html`

**When:** a body or a reply declares several media types.

**Why:** an alxia route has one `body` schema and one schema per status.
`alxia.ts` keeps `application/json` (or the first JSON type, then the first
form or text type): a body sent as another type is checked against that
schema, and the handler cannot reply as the other type.

**Fix:** declare one media type where you can. To serve several, declare
that route by hand.

### A refused request gets `{ error: 'validation', issues }`, not `ValidationErrorBody`

**When:** a client generated from the same spec reads alxia's 400, and the
files were generated by 0.6.0, or with `hono: true` beside `alxia: true`
before 0.7.0.

**Why:** up to 0.6.0, [`validationErrors`](guide/options.md#validationerrors)
always declared `@nxgt/openapi-hono`'s 400,
`{ status, message, timestamp, issues }`, which alxia never sends.

**Fix:** generate again with 0.7.0 or later. With `alxia: true` and `hono`
off, `ValidationErrorBody` is alxia's `{ error: 'validation', issues }`;
with both on, it is a union of the two. A spec served by alxia alone drops
`hono`:

```ts
// openapi-codegen.config.ts
export default defineConfig({ input: 'openapi.yaml', output: 'src/generated', alxia: true });
```

An app that answers refusals with a body of its own, through `onRefusal`,
declares that body in the spec and sets `validationErrors: false`.

### `ignored`: `` <operationId>: types.ts, zod.ts, operations.ts and paths.ts leave out its cookie `session`: a client does not set cookies, the browser or its cookie jar sends them ``

**When:** an operation has an `in: cookie` parameter. Up to 0.6.0 the run
failed instead, with ``cookie parameter `session` is not supported
[unsupported_parameter]``.

**Why:** only `alxia.ts` validates cookies, as the route's `cookies`. A
client call has no cookie argument: a browser sends the cookies it holds,
and a server-side client sends those of its cookie jar or a `Cookie`
header you set.

**Fix:** nothing, unless the client runs outside a browser: then set the
cookie on the call yourself, as with `@nxgt/openapi-httpyz`'s call options:

```ts
// getMe takes no input, so its options come first
await api.get('/me', { headers: { cookie: `session=${token}` } });
```

### `not_enforced`: `` <operationId>: hono.ts routes it without validating its cookie `session`: read it with getCookie() from hono/cookie ``

**When:** an operation with an `in: cookie` parameter, generated with
`hono: true`.

**Why:** `@nxgt/openapi-hono` validates path, query and header parameters
and the body, not cookies. The route is registered, and its handler runs
whatever cookie arrives.

**Fix:** read and check the cookie in a middleware or the handler:

```ts
import { getCookie } from 'hono/cookie';

routes.get('/me', (c) => {
	const session = getCookie(c, 'session');
	if (!session) return c.json({ title: 'Sign in' }, 401);
	return c.json(users.bySession(session), 200);
});
```

### `` cookie parameter `ids` is a list; a cookie carries one value ``

**When:** an `in: cookie` parameter's schema is an array. An object is
refused too, with `only strings, numbers, booleans, enums and lists of them
can be read from a cookie`.

**Why:** alxia hands each cookie over as one string, and the generator does
not guess how a list is joined in it.

**Fix:** declare the cookie as a string, and split it in the handler.

### `Cannot find module '@alxia/core'` in `alxia.ts`

**When:** an operation replies with server-sent events.

**Why:** `alxia.ts` imports `eventStream` from `@alxia/core` for that reply,
and only then.

**Fix:** add `@alxia/core` to the app's dependencies, as an alxia app
already has it.
