# Getting started

This page starts a new API project from the package's `tsp init` template,
then takes it from the spec to a running Hono route.

## Start a project

Run `tsp init` with the template, in an empty directory:

```sh
mkdir petstore && cd petstore
npx --package=@typespec/compiler tsp init https://unpkg.com/@nxgt/typespec/templates/scaffolding.json
```

`tsp init` asks for the template, the project's name and the emitters. To
answer them on the command line instead:

```sh
npx --package=@typespec/compiler tsp init https://unpkg.com/@nxgt/typespec/templates/scaffolding.json \
  --template nxgt -y --project-name petstore
```

`--package=@typespec/compiler` matters: in a directory without the compiler,
a bare `npx tsp` runs `tsp`, an unrelated npm package. `bunx
--package=@typespec/compiler tsp init …` works too.

`tsp init` writes into the current directory, then runs `npm install`, so it
needs the network. The template ships from 0.9.0 on.

## What it writes

| File | What it holds |
| --- | --- |
| `package.json` | the compiler, `@typespec/http`, `@typespec/openapi`, `@typespec/openapi3`, `@nxgt/typespec` and `@nxgt/openapi-codegen`, at their latest versions |
| `tspconfig.yaml` | the linter's recommended rules, and OpenAPI 3.1 written to `openapi/openapi.yaml` |
| `main.tsp` | the service, marked with `@operationIds`, and a `Users` resource |
| `openapi-codegen.config.ts` | the generator's input and output, with the Hono routes on |
| `README.md` | the commands below, and the scripts to add |
| `.gitignore` | `node_modules/`, and TypeSpec's default output |

`tspconfig.yaml` turns the linter on and emits OpenAPI 3.1, which
`@nxgt/openapi-codegen` reads (it refuses 3.0, the emitter's default):

```yaml
# tspconfig.yaml
linter:
  extends:
    - "@nxgt/typespec/recommended"
emit:
  - "@typespec/openapi3"
options:
  "@typespec/openapi3":
    emitter-output-dir: "{project-root}/openapi"
    openapi-versions:
      - 3.1.0
    output-file: openapi.yaml
```

`main.tsp` declares the service in a namespace named after the project, and
one resource with each convention in place: a paged, filtered and sorted
list, and the error aliases of each verb.

```tsp
// main.tsp (excerpt)
@service(#{ title: "petstore" })
@operationIds
namespace Petstore;

model User {
  @visibility(Lifecycle.Read)
  id: uuid;

  @minLength(1)
  @maxLength(80)
  name: string;

  email: email;

  ...Timestamps;
}

@route("/users")
@tag("Users")
interface Users {
  @get
  list(
    ...UserFilters,
    ...PageParameters,
    ...SortParameters<"name" | "createdAt">,
  ): Page<User> | ListErrors;

  @get
  get(@path id: uuid): User | GetErrors;

  @post
  create(@body user: Create<User>): {
    @statusCode _: 201;
    @body user: User;
  } | CreateErrors;

  @patch
  update(@path id: uuid, @body user: MergePatchUpdate<User>): User | UpdateErrors;

  @delete
  delete(@path id: uuid): NoContentResponse | DeleteErrors;
}
```

`@operationIds` names the operations `listUsers`, `getUser`, `createUser`,
`updateUser` and `deleteUser` ([Operation ids](operation-ids.md)).

```ts
// openapi-codegen.config.ts
import { defineConfig } from '@nxgt/openapi-codegen';

export default defineConfig({
	input: 'openapi/openapi.yaml',
	output: 'src/generated',
	hono: true,
});
```

## Compile and generate

Compile the spec to `openapi/openapi.yaml`, then generate the code from it:

```sh
npx tsp compile .
npx nxgt-openapi generate
```

```text
openapi/openapi.yaml → src/generated: 5 written, 0 unchanged
```

`src/generated` then holds `types.ts`, `zod.ts`, `operations.ts`, `paths.ts`
and `hono.ts`. The linter runs in `tsp compile`; the template's spec passes
it.

## Add the scripts

`tsp init` writes its own `package.json`, so the template cannot add
scripts. Add these two, so the code never lags the spec:

```json
{
  "scripts": {
    "api": "tsp compile . && nxgt-openapi generate",
    "api:check": "tsp compile . && nxgt-openapi generate --check"
  }
}
```

`api:check` exits with 1 and lists the files when the generated code is out
of date: run it in CI.

## Serve it

The generated `hono.ts` binds the routes to the spec through
[`@nxgt/openapi-hono`](https://www.npmjs.com/package/@nxgt/openapi-hono).
Install it, Hono, and zod, which the generated validators import:

```sh
bun add @nxgt/openapi-hono hono zod
bun add -d typescript
```

Then register a handler per operation. Each one reads its validated input,
and may only answer the replies the spec declares:

```ts
// src/app.ts
import { Hono } from 'hono';
import { createRoutes } from './generated/hono';

const app = new Hono();
const routes = createRoutes(app);

routes.operation('getUser', async (c) => {
	const { id } = c.req.valid('param');
	const user = await users.find(id);
	if (!user) {
		return c.json(
			{ status: 404, message: 'errors.not-found', timestamp: new Date().toISOString() },
			404,
		);
	}
	return c.json(user, 200);
});

routes.operation('listUsers', async (c) => {
	const { page = 1, pageSize = 20, orderBy, direction } = c.req.valid('query');
	return c.json(await users.page({ page, pageSize, orderBy, direction }), 200);
});

export default app;
```

`users` stands for your data layer. A `418`, or a 404 without `timestamp`,
does not compile. More on the routes in the
[`@nxgt/openapi-hono` README](https://www.npmjs.com/package/@nxgt/openapi-hono),
and on serving a page in [Pagination](pagination.md#serving-it).

## Rename the resource

`Users` is an example. To make it your own resource, rename the model, its
filters, the interface, the route and the tag in `main.tsp`, and the body
parameters with them:

```tsp
model Pet {
  @visibility(Lifecycle.Read)
  id: uuid;

  @minLength(1)
  name: string;

  ...Timestamps;
}

model PetFilters {
  @query
  name?: string;
}

@route("/pets")
@tag("Pets")
interface Pets {
  @get
  list(...PetFilters, ...PageParameters, ...SortParameters<"name" | "createdAt">): Page<Pet> | ListErrors;

  @get
  get(@path id: uuid): Pet | GetErrors;

  @post
  create(@body pet: Create<Pet>): {
    @statusCode _: 201;
    @body pet: Pet;
  } | CreateErrors;

  @patch
  update(@path id: uuid, @body pet: MergePatchUpdate<Pet>): Pet | UpdateErrors;

  @delete
  delete(@path id: uuid): NoContentResponse | DeleteErrors;
}
```

The operation names stay; `@operationIds` takes the resource from the
interface, so the ids become `listPets`, `getPet`, `createPet`, `updatePet`
and `deletePet`. Run `tsp compile .` and `nxgt-openapi generate` again, and
the generated types, `Pet` and `PetPage`, follow. A name the singular rule
does not know takes `@operationIds(#{ singular: "…" })` on the interface
([Operation ids](operation-ids.md)).

A second resource is a second model and interface, in the same namespace or
in files of their own ([README](../README.md#a-spec-split-across-files)).

Next: what each error alias holds, in [Error replies](errors.md), and the
rules the linter checks, in [Linter](linter.md).
