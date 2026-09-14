# Command line

`nxgt-openapi` runs `generate()` from a config file or from flags. It runs
on Bun: its first line is `#!/usr/bin/env bun`.

```sh
bunx nxgt-openapi generate                        # openapi-codegen.config.ts
bunx nxgt-openapi generate --config api/codegen.config.ts
bunx nxgt-openapi generate -i openapi/openapi.yaml -o src/generated
bunx nxgt-openapi generate --check                # in CI
```

## Config file

```ts
// openapi-codegen.config.ts
import { defineConfig } from '@nxgt/openapi-codegen';

export default defineConfig({
	input: 'openapi/openapi.yaml',
	output: 'src/generated',
	unknownKeys: 'strict',
});
```

- **Which file.** Without `--config`, the command uses the first of
  `openapi-codegen.config.ts`, `.mts`, `.js` and `.mjs` it finds in the
  current directory.
- **What it takes.** Every [option](options.md) of `generate()`. `check` is
  the `--check` flag.
- **Output.** `output` may be left out: the files then go to
  `generated/openapi`.
- **Paths.** `input` and `output` resolve against the config file's
  directory, wherever the command runs.
- **`defineConfig`** types a single config and returns it unchanged. A
  plain `export default {…}` works the same.

A list generates several specs in one run. A second argument holds what
they share:

```ts
export default defineConfig(
	[
		{ input: 'openapi/public.yaml', output: 'src/generated/public' },
		{ input: 'openapi/admin.yaml', output: 'src/generated/admin', dates: 'string' },
	],
	{ hono: true, dates: 'date' },
);
```

- **An entry's own option wins** over the shared one: `admin` keeps its
  dates as strings. `names` merge instead, the entry's winning per key.
- **`input` and `output` are each spec's own.** A shared config that sets
  one throws.
- **Two entries that write to the same directory are refused**
  (`invalid_config`), two entries without an `output` included: they would
  overwrite each other's files.

## Flags

| Flag | |
| --- | --- |
| `-c, --config <file>` | the config file |
| `-i, --input <file>`, `-o, --output <dir>` | one spec instead of a config file, relative to the current directory; `--output` defaults to `generated/openapi` |
| `--check` | write nothing; list what is missing or stale, and exit 1 |
| `--lint` | lint each spec with Redocly first, as [`lint: true`](options.md#lint) does; a config's own `lint` file is kept |
| `-h, --help` | the usage |
| `-v, --version` | the package's version |

## What it prints

```
openapi/openapi.yaml → src/generated: 2 written, 2 unchanged
```

- **Paths** are relative to the current directory.
- **Warnings** go to stderr, one per line, as `formatDiagnostic` prints
  them.
- **With `--check`** it prints `up to date`, or `out of date` followed by the
  files.

## Exit codes

| Code | When |
| --- | --- |
| 0 | generated, or `--check` found everything up to date |
| 1 | the spec cannot be generated (every error of the failing stage is printed), the config file is missing or exports no config (`invalid_config`), or `--check` found drift |
| 2 | the command line is wrong: no command, an unknown flag, `--output` without `--input`, or `--config` with `--input` |

## In package.json

```json
{
	"scripts": {
		"generate:api": "nxgt-openapi generate",
		"check:api": "nxgt-openapi generate --check"
	}
}
```
