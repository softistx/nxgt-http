# Authoring the spec in TypeSpec

[TypeSpec](https://typespec.io) is a language for writing API specs: models,
templates and decorators instead of hand-written YAML. It does not replace the
generator. It sits upstream of it: TypeSpec compiles the spec to OpenAPI 3.1,
and the generator reads that file like any other.

```
main.tsp ──tsp compile──▶ openapi.yaml (3.1) ──nxgt-openapi generate──▶ types.ts, zod.ts, operations.ts, paths.ts, hono.ts
```

Everything after the spec stays the same: the generated code,
[`@nxgt/openapi-hono`](https://github.com/softistx/nxgt-http/blob/develop/packages/openapi-hono/README.md),
[`@nxgt/openapi-httpyz`](https://github.com/softistx/nxgt-http/blob/develop/packages/openapi-httpyz/README.md),
[`@nxgt/openapi-msw`](https://github.com/softistx/nxgt-http/blob/develop/packages/openapi-msw/README.md)
and the rest. The generator's own CI holds this path. It compiles a TypeSpec
project with `@typespec/openapi3`, then generates from it. It type-checks the
result under the strictest settings, and serves it with `@nxgt/openapi-hono`.

## Install

```sh
bun add -d @typespec/compiler @typespec/http @typespec/openapi @typespec/openapi3
bun add -d @nxgt/openapi-codegen
bun add zod hono @nxgt/openapi-hono
```

`hono` and `@nxgt/openapi-hono` are for the `hono.ts` that `hono: true`
generates below. Leave them out, with the option, if you do not serve the
spec with Hono.

The generator's CI runs TypeSpec 1.17. `@typespec/openapi` holds
`@operationId`, imported with `import "@typespec/openapi"` and
`using OpenAPI`.

## Emit OpenAPI 3.1

`@typespec/openapi3` emits OpenAPI **3.0** unless told otherwise, and the
generator refuses 3.0 with `unsupported_version`. Ask for 3.1 in
`tspconfig.yaml`, next to `main.tsp`:

```yaml
# api/tspconfig.yaml
emit:
  - '@typespec/openapi3'
options:
  '@typespec/openapi3':
    openapi-versions: ['3.1.0']
    emitter-output-dir: '{project-root}/../openapi'
    output-file: openapi.yaml
```

```tsp
// api/main.tsp
import "@typespec/http";
import "@typespec/openapi";

using Http;
using OpenAPI;

@service(#{ title: "Pet store" })
namespace PetStore;

enum Status {
  available,
  adopted,
}

model Pet {
  @visibility(Lifecycle.Read)
  @format("uuid")
  id: string;

  @minLength(1)
  name: string;

  status: Status;
}

@error
model Problem {
  code: string;
  message: string;
}

model NotFound {
  @statusCode _: 404;
  @body problem: Problem;
}

@route("/pets")
interface Pets {
  @get
  @operationId("listPets")
  list(@query status?: Status): Pet[];

  @get
  @operationId("getPet")
  read(@path @format("uuid") petId: string): Pet | NotFound;

  @post
  @operationId("createPet")
  create(@body pet: Create<Pet>): {
    @statusCode _: 201;
    @body pet: Pet;
  };
}
```

```sh
bunx --no-install tsp compile api
```

`--no-install` makes a missing `@typespec/compiler` an error: without it,
`bunx` would fetch and run an unrelated npm package named `tsp`.

This writes `openapi/openapi.yaml`.

## Generate from it

Point the generator at the emitted file, as at any spec:

```ts
// openapi-codegen.config.ts
import { defineConfig } from '@nxgt/openapi-codegen';

export default defineConfig({
	input: 'openapi/openapi.yaml',
	output: 'src/generated',
	hono: true,
});
```

Chain both steps in one script, so the code never lags the `.tsp`:

```json
{
	"scripts": {
		"api": "tsp compile api && nxgt-openapi generate",
		"api:check": "tsp compile api && nxgt-openapi generate --check"
	}
}
```

`--check` writes nothing and exits 1 when a generated file is stale
([the command line](cli.md)). Run `api:check` in CI, then `git diff
--exit-code openapi/` to catch an `openapi.yaml` that was not committed
after an edit to the `.tsp`.

## What TypeSpec becomes

What `@typespec/openapi3` emits, and what the generator makes of it. Each
row is in the CI fixture.

| TypeSpec | Emitted | Generated |
| --- | --- | --- |
| `enum Status { available, adopted }` | a named string `enum` | `const Status = { Available: 'available', … } as const` and its type |
| `enum Size { Small: "S" }` | `enum: [S]`: the member names are not emitted | `const Size = { S: 'S' }` |
| `@discriminated(#{ envelope: "none", discriminatorPropertyName: "kind" }) union` | `oneOf` with a `discriminator` and its `mapping` | `Dog \| Cat`, `z.discriminatedUnion('kind', …)` |
| `Record<int32>` | `unevaluatedProperties: { type: integer }` | `{ [key: string]: number }` |
| `utcDateTime \| null` | `anyOf: [date-time, null]` | `string \| null`, or `Date \| null` with [`dates: 'date'`](options.md#dates) |
| `int64` | `format: int64` | `number`, `z.int()`: a safe integer |
| `@visibility(Lifecycle.Read)` | `readOnly: true` | no effect: see [Request bodies](#request-bodies) |
| `Create<Pet>` | a `CreatePet` schema, without the read-only properties | `CreatePet` |
| `MergePatchUpdate<Pet>` | an `application/merge-patch+json` body: every property optional, and those that were optional also nullable | `PetMergePatchUpdate`, read from that media type |
| `@query limit?: int32 = 20` | an optional parameter with `default: 20` | filled in with 20 when absent, on the server side |
| `@query(#{ explode: true }) tags?: string[]` | `explode: true` | `?tags=a&tags=b` |
| `@error` model behind `@statusCode _: 404` | a `404` response with that schema | a `404` reply, typed |
| `Pet \| NotFound` as a return type | one response per status | one typed reply per status |

## Request bodies

With implicit visibility, `@typespec/openapi3` reuses the read model for a
request body when the only difference is `readOnly` properties. The
generator ignores `readOnly`, so the body would require `id` and the other
read-only properties. Name the visibility the body takes:

```tsp
@post create(@body pet: Create<Pet>): Pet;
@patch update(@path id: string, @body pet: MergePatchUpdate<Pet>): Pet;
```

## Names

- **Operation ids.** Without `@operationId`, TypeSpec names an operation
  after its interface: `Pets_list`. That id becomes the client's method and
  the prefix of its types (`PetsListQuery`). Give each operation an
  `@operationId`, or put
  [`@nxgt/typespec`](https://github.com/softistx/nxgt-http/blob/develop/packages/typespec/docs/guide/operation-ids.md)'s
  `@operationIds` on the interface or the service namespace, which names
  each operation as written: `@get listPets()` is `listPets`.
- **Template instances.** `Page<Pet>` is emitted inline, and the generator
  names it after the operation and status: `PetsList200Response`. Give the
  template a name pattern to get a named schema:

  ```tsp
  @friendlyName("{name}Page", Item)
  model Page<Item> {
    items: Item[];
    nextCursor?: string;
  }
  ```

  `Page<Pet>` is then the schema `PetPage`.

## A QUERY sent as a POST

`QUERY` is the HTTP method for a safe request with a body.
`@typespec/http` 1.17 declares none, so `@nxgt/typespec`'s `@queryMethod`
marks a `@post` and the emitted operation carries `x-nxgt-method: query`:

```tsp
import "@typespec/http";
import "@nxgt/typespec";

using Http;
using Nxgt;

@route("/users")
interface Users {
  @post @queryMethod @route("/search")
  search(@body criteria: UserCriteria): User[];
}
```

```yaml
/users/search:
  post:
    operationId: searchUsers
    x-nxgt-method: query
```

The extension is plain OpenAPI, so a hand-written spec can set it on any
`post` operation. The generator reads it and marks that operation's entry in
the `operations` table, where the other entries do not have the key:

```ts
import { operations } from './generated/operations';

operations.searchUsers.method; // 'post': what is sent
operations.searchUsers.queryMethod; // true
operations.createUser.queryMethod; // undefined
```

The entry is typed `readonly queryMethod?: true` on `OperationSpec`, and its
JSDoc says "A `QUERY`, sent as a `POST`: it changes nothing, and its criteria
are the body." Nothing else changes: the client, the Hono route and the
validators treat it as the `POST` it is, with the criteria as its body.

| `x-nxgt-method` | On | Result |
| --- | --- | --- |
| `query` | a `post` operation | `queryMethod: true` |
| `query` | another method | ignored, warning `ignored` |
| any other value | any operation | ignored, warning `ignored` |

```text
warning ignored: x-nxgt-method: query marks a POST as a QUERY, not a GET   (/paths/~1users/get/x-nxgt-method)
warning ignored: x-nxgt-method takes only query: "search" is not it   (/paths/~1users/post/x-nxgt-method)
```

This is not the OpenAPI 3.2 `query` operation, which the generator also
reads: there `method` is `'query'`, and an OpenAPI 3.1 document with one is
refused (`unsupported_operation`). `x-nxgt-method: query` works in 3.1 and
3.2, on a `post`. When `@typespec/http` declares `QUERY`, `@queryMethod`
changes and a spec does not.

## When it fails

[Troubleshooting](../troubleshooting.md) has each trap this path hits, with
its fix. [Diagnostics](diagnostics.md) lists every code the generator
reports.
