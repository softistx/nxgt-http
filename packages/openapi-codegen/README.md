# @nxgt/openapi-codegen

Generates TypeScript types, Zod 4 validators and a typed map of every
operation from an OpenAPI 3.1 or 3.2 document, whether it is one file or
split across many. Types and validators are printed from the same reading of
the spec, so they cannot disagree. With the `hono` option, it also types a
Hono app's routes from the spec, which
[`@nxgt/openapi-hono`](https://github.com/softistx/nxgt-http/blob/develop/packages/openapi-hono/README.md) validates.

## Install

```sh
bun add zod
bun add -d @nxgt/openapi-codegen
```

Both peers are required:

- `zod` 4.5.4 or later, which the generated validators import. Earlier
  releases refuse valid values in some intersections;
- `typescript` 6, the version every `@nxgt` package pins. The generator does
  not call it.

For typed Hono routes, the generated `hono.ts` imports the runtime
`@nxgt/openapi-hono` and `hono`; the generator stays a dev dependency:

```sh
bun add @nxgt/openapi-hono hono zod
```

To lint the spec with Redocly before generating ([`lint`](docs/guide/options.md#lint)),
add its other optional peer:

```sh
bun add -d @redocly/openapi-core
```

The generator runs on Bun; the code it generates runs anywhere.

## Subpaths

| Import | For |
| --- | --- |
| `@nxgt/openapi-codegen` | the generator: `generate()`, `defineConfig`, the pipeline stages |

The Hono runtime that was `@nxgt/openapi-codegen/hono` in 0.1.0 is now its
own package, [`@nxgt/openapi-hono`](https://github.com/softistx/nxgt-http/blob/develop/packages/openapi-hono/README.md).

## Usage

### Generate

From the command line, with a config file:

```ts
// openapi-codegen.config.ts
import { defineConfig } from '@nxgt/openapi-codegen';

export default defineConfig({
	input: 'openapi/openapi.yaml',
	output: 'src/generated',
});
```

```sh
bunx nxgt-openapi generate
```

A config file can also list several specs, with the options they share as
a second argument: `defineConfig([{ input: 'a.yaml', output: 'gen/a' }, …],
{ hono: true })`. See [the command line](docs/guide/cli.md#config-file).

Or from code:

```ts
import { generate } from '@nxgt/openapi-codegen';

await generate({ input: 'openapi/openapi.yaml', output: 'src/generated' });
```

This writes four files to `output`, `generated/openapi` when it is left
out:

- `types.ts`: a type per schema, an `as const` object per named enum,
  and the `Operations` map with its indexes;
- `zod.ts`: a `z<Name>` validator per schema;
- `operations.ts`: every operation as data, with its parameter and form
  validators;
- `paths.ts`: `paths`, `operations` and `components` in the shape
  openapi-typescript prints, so `createClient<paths>()` from openapi-fetch
  works with no other step.

`types.ts` also holds `ClientOperations`, the map
[`@nxgt/openapi-httpyz`](https://github.com/softistx/nxgt-http/blob/develop/packages/openapi-httpyz/README.md) reads to type a
client over [`@nxgt/httpyz`](https://github.com/softistx/nxgt-http/blob/develop/packages/httpyz/README.md).
A reply of server-sent events or JSON Lines is described an item at a time,
from OpenAPI 3.2's `itemSchema`: each event is typed and validated by its
name ([Streams](docs/guide/generated-code.md#streams)).

With `hono: true`, it writes a fifth, `hono.ts`.

`$ref`s are followed across files by relative path, including into
`node_modules` (`../node_modules/@acme/fragments/Error.yaml`).

### Validate with the generated code

```ts
import type { Employee } from './generated/types.js';
import { zNewEmployee } from './generated/zod.js';
import { operations } from './generated/operations.js';

const body = zNewEmployee.parse(await request.json());
const query = operations.listEmployees.query.parse({ page: '2' }); // { page: 2 }
```

### Serve typed Hono routes

With `hono: true` in the config:

```ts
import { Hono } from 'hono';
import { createRoutes } from './generated/hono.js';

const app = new Hono();

createRoutes(app).put('/employees/{id}', auth, async (c) => {
	const { id } = c.req.valid('param');
	const employee = await employees.update(id, c.req.valid('json'));
	if (!employee) return c.json({ message: 'errors.not-found' }, 404);
	return c.json(employee, 200);
});
```

`auth` runs first. A request the spec refuses then gets a 400 listing every
issue. A reply the spec does not declare does not compile.
[Typed Hono routes](https://github.com/softistx/nxgt-http/blob/develop/packages/openapi-hono/docs/guide.md) covers modules, error
hooks and reply checks.

### Fail CI when the generated code is stale

```sh
bunx nxgt-openapi generate --check
```

It writes nothing, lists what is missing or stale, and exits 1. From code:

```ts
const { drifted } = await generate({
	input: 'openapi/openapi.yaml',
	output: 'src/generated',
	check: true,
});
if (drifted.length > 0) process.exit(1);
```

### Report what cannot be generated

```ts
import { CodegenError, generate } from '@nxgt/openapi-codegen';

try {
	await generate({ input: 'openapi/openapi.yaml', output: 'src/generated' });
} catch (error) {
	if (error instanceof CodegenError) console.error(error.message);
	process.exit(1);
}
```

`error.message` lists every error the failing stage found, each at its
`file#pointer`. `error.diagnostics` carries them, and the stage's warnings,
each with a stable `code`.

### Lower-level API

`defineConfig` types a config file, and `loadConfig` finds and reads one the
way the command line does. `generateFiles` returns the files instead of
writing them. `formatDiagnostic` prints one diagnostic the way
`CodegenError` does. The pipeline stages are exported too, for tools built
on the spec:

- `loadDocument`, `Resolver`, `createMemoryFileSystem` and `nodeFileSystem`;
- `buildIR` and the IR types;
- `HTTP_METHODS`.

[The architecture](docs/architecture/overview.md) describes each stage.

## Traps

- **The `nxgt-openapi` bin runs on Bun.** Its first line is
  `#!/usr/bin/env bun`: run it with `bunx`, or with Bun on the `PATH`.
- **OpenAPI 3.1 and 3.2 only.** A 3.0 or Swagger 2.0 document is refused;
  convert it. 3.0's `nullable: true` is read with a warning, and
  `legacyNullable: 'error'` refuses it.
- **Unsupported JSON Schema is an error, not a guess.** `not`,
  `if`/`then`/`else`, `patternProperties`, tuples and cookie parameters fail
  the run, each at its pointer.
- **`date-time` stays a string**, validated as RFC 3339 with its offset:
  `2024-01-01T00:00:00` without `Z` is refused. `dates: 'date'` decodes it
  to a `Date` instead; `format: date` stays a string either way.
- **`readOnly` and `writeOnly` are not enforced.** A required `readOnly`
  property is required in a request body too. Give requests their own
  schema.
- **Imports end in `.js`** (`./types.js`) so they resolve under every
  `moduleResolution`. Set `importExtension: ''` if a tool needs bare
  specifiers.
- **Keep the output away from your formatter and linter.** It is printed
  tab-indented, not by your tools. Exclude the output directory.
- **`hono.ts` imports `@nxgt/openapi-hono` at runtime.** Install it, and
  `hono`, as dependencies once you generate that file; this package stays a
  dev dependency.
- **Give `c.json()` a status, and reply with plain objects.** Without a
  status, Hono types a reply with any status, and it matches no declared
  one. A Mongoose document does not type as its schema; return `.lean()`
  results.

## Documentation

The package ships a `docs/` folder:

- [the command line](docs/guide/cli.md): flags, config files, exit codes;
- [typed Hono routes](https://github.com/softistx/nxgt-http/blob/develop/packages/openapi-hono/docs/guide.md), in
  `@nxgt/openapi-hono`: routes, validation errors, modules, reply checks;
- [the guide](docs/README.md): the generated code, every option, how each
  JSON Schema keyword maps, and every diagnostic code;
- [the architecture](docs/architecture/overview.md), for working on the
  generator.
