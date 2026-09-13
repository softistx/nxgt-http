# @nxgt/openapi-codegen

Generates TypeScript types, Zod 4 validators and a typed map of every
operation from an OpenAPI 3.1 or 3.2 document, whether it is one file or
split across many. Types and validators are printed from the same reading of
the spec, so they cannot disagree.

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

The generator runs on Bun; the code it generates runs anywhere.

## Usage

### Generate

```ts
import { generate } from '@nxgt/openapi-codegen';

await generate({ input: 'openapi/openapi.yaml', output: 'src/generated' });
```

This writes four files:

- `types.gen.ts`: a type per schema, and the `Operations` map;
- `zod.gen.ts`: a `z<Name>` validator per schema;
- `operations.gen.ts`: every operation as data, with its parameter
  validators;
- `paths.gen.ts`: `paths`, `operations` and `components` in the shape
  openapi-typescript prints, so `createClient<paths>()` from openapi-fetch
  works with no other step.

`$ref`s are followed across files by relative path, including into
`node_modules` (`../node_modules/@acme/fragments/Error.yaml`).

### Validate with the generated code

```ts
import type { Employee } from './generated/types.gen.js';
import { zNewEmployee } from './generated/zod.gen.js';
import { operations } from './generated/operations.gen.js';

const body = zNewEmployee.parse(await request.json());
const query = operations['get /employees'].query.parse({ page: '2' }); // { page: 2 }
```

### Fail CI when the generated code is stale

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

`generateFiles` returns the files instead of writing them. `formatDiagnostic`
prints one diagnostic the way `CodegenError` does. The pipeline stages are
exported too, for tools built on the spec:

- `loadDocument`, `Resolver`, `createMemoryFileSystem` and `nodeFileSystem`;
- `buildIR` and the IR types;
- `HTTP_METHODS`.

[The architecture](docs/architecture/overview.md) describes each stage.

## Traps

- **OpenAPI 3.1 and 3.2 only.** A 3.0 or Swagger 2.0 document is refused;
  convert it. 3.0's `nullable: true` is read with a warning, and
  `legacyNullable: 'error'` refuses it.
- **Unsupported JSON Schema is an error, not a guess.** `not`,
  `if`/`then`/`else`, `patternProperties`, tuples and cookie parameters fail
  the run, each at its pointer.
- **`date-time` stays a string**, validated as RFC 3339 with its offset:
  `2024-01-01T00:00:00` without `Z` is refused.
- **`readOnly` and `writeOnly` are not enforced.** A required `readOnly`
  property is required in a request body too. Give requests their own
  schema.
- **Imports end in `.js`** (`./types.gen.js`) so they resolve under every
  `moduleResolution`. Set `importExtension: ''` if a tool needs bare
  specifiers.
- **Keep the output away from your formatter and linter.** It is printed
  tab-indented, not by your tools. Exclude the output directory.

## Documentation

The package ships a `docs/` folder:

- [the guide](docs/README.md): the generated code, every option, how each
  JSON Schema keyword maps, and every diagnostic code;
- [the architecture](docs/architecture/overview.md), for working on the
  generator.
