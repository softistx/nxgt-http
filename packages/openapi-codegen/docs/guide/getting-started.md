# Getting started

## Install

```sh
bun add zod
bun add -d @nxgt/openapi-codegen
```

The generated validators import `zod` 4.5.4 or later at runtime. The generator
itself runs on Bun; the code it generates runs anywhere.

## Generate

```ts
// scripts/generate-api.ts
import { generate } from '@nxgt/openapi-codegen';

const { written, warnings } = await generate({
	input: 'openapi/openapi.yaml',
	output: 'src/generated',
});
for (const warning of warnings) console.warn(warning.message);
console.log(`${written.length} file(s) written`);
```

```sh
bun scripts/generate-api.ts
```

`input` is the root document of the spec: a single file, or one that `$ref`s
the rest. References are followed by relative path, into `node_modules`
too, so a spec can reuse fragments published as a package. A bare package
specifier (`@acme/api-fragments/...`) is not resolved.

```yaml
components:
  schemas:
    ErrorResponse:
      $ref: ../node_modules/@acme/api-fragments/schemas/ErrorResponse.yaml
```

Only OpenAPI 3.1 and 3.2 are read. Convert a 3.0 or Swagger 2.0 document
first.

Four files land in `output`:

| File | Holds | Imports |
| --- | --- | --- |
| `types.gen.ts` | a type per schema, and the `Operations` map | nothing |
| `zod.gen.ts` | a `z<Name>` validator per schema | `zod`; types from `types.gen.ts` when a schema is recursive |
| `operations.gen.ts` | every operation as data, with its parameter validators | `zod`, `zod.gen.ts`, types from `types.gen.ts` |
| `paths.gen.ts` | `paths`, `operations` and `components`, as openapi-typescript prints them | types from `types.gen.ts` |

A file whose content would not change is not rewritten, so a file watcher
does not fire on a run that changed nothing. Commit the files, or generate
them in a build step.

## Use

```ts
import type { Employee } from './generated/types.gen.js';
import { zNewEmployee } from './generated/zod.gen.js';

const input = zNewEmployee.parse(await request.json()); // throws a ZodError on bad input
```

[The generated code](generated-code.md) walks through all three files.

## Keep the files in step, in CI

```ts
import { generate } from '@nxgt/openapi-codegen';

const { drifted } = await generate({
	input: 'openapi/openapi.yaml',
	output: 'src/generated',
	check: true,
});
if (drifted.length > 0) {
	console.error(`Out of date: ${drifted.join(', ')}. Run the generator.`);
	process.exit(1);
}
```

`check` writes nothing. `drifted` lists every file a run would change or
create.

## When the spec cannot be generated

`generate` throws one `CodegenError` that lists every error, each at the file
and JSON pointer it is in:

```
2 error(s) in the OpenAPI document:
  error paths/pets.yaml#/get/parameters/0/in: cookie parameter `session` is not supported [unsupported_parameter]
  error components/schemas/Pet.yaml#/not: `not` is not supported [unsupported_keyword]
```

The generator refuses what it cannot express faithfully rather than
approximating it.

Each stage reports all of its errors in one pass: every missing file at
once, then every schema and operation problem at once. A spec split over
forty files is fixed in a few rounds, not forty. Fixing a missing file can
still reveal schema errors that it hid. [Diagnostics](diagnostics.md)
explains every code.

```ts
import { CodegenError, generate } from '@nxgt/openapi-codegen';

try {
	await generate({ input: 'openapi/openapi.yaml', output: 'src/generated' });
} catch (error) {
	if (!(error instanceof CodegenError)) throw error;
	for (const d of error.diagnostics) {
		if (d.severity === 'error') console.error(d.code, d.file, d.pointer);
	}
	process.exit(1);
}
```
