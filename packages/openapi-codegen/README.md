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
bun add -d @nxgt/openapi-codegen typescript
```

Peers:

- `zod` 4.5.4 or later, **required**. The generated validators import it.
  Earlier releases refuse valid values in some intersections.
- `typescript` 6, **required**: the version every `@nxgt` package pins. The
  generator does not call it.
- `@redocly/openapi-core`, **optional**: only for
  [`lint`](docs/guide/options.md#lint). Add it with `bun add -d`.

With `hono: true`, the generated `hono.ts` imports `@nxgt/openapi-hono` at
runtime and `hono`'s types, and your app builds its own `Hono`: add both to
your app's dependencies. The generator stays a dev dependency.

The generator runs on Bun. The code it generates runs anywhere, and compiles
under the strictest `tsconfig` an app may have: `strict`,
`noUnusedLocals`, `exactOptionalPropertyTypes`,
`noPropertyAccessFromIndexSignature`, `noUncheckedIndexedAccess`,
`verbatimModuleSyntax`. Every fixture is checked with them.

## Setup

A config file at the project root, which the command line finds on its own:

```ts
// openapi-codegen.config.ts
import { defineConfig } from '@nxgt/openapi-codegen';

export default defineConfig({
	input: 'openapi/openapi.yaml',
	output: 'src/generated',
});
```

Two scripts, one to generate and one for CI:

```json
{
	"scripts": {
		"generate:api": "nxgt-openapi generate",
		"check:api": "nxgt-openapi generate --check"
	}
}
```

`input` and `output` resolve against the config file's directory. A config
file can also list several specs, with the options they share as a second
argument: `defineConfig([{ input: 'a.yaml', output: 'gen/a' }, …],
{ hono: true })`. See [the command line](docs/guide/cli.md#config-file).

## Subpaths

| Import | For |
| --- | --- |
| `@nxgt/openapi-codegen` | the generator: `generate()`, `defineConfig`, the pipeline stages |

The Hono runtime that was `@nxgt/openapi-codegen/hono` in 0.1.0 is now its
own package, [`@nxgt/openapi-hono`](https://github.com/softistx/nxgt-http/blob/develop/packages/openapi-hono/README.md).

## Usage

### Generate

```sh
bunx nxgt-openapi generate
```

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

With `hono: true`, it writes a fifth, `hono.ts`. A file an earlier run
generated and this one does not, `hono.ts` once `hono` is off, is deleted.

`types.ts` also holds `ClientOperations`, the map
[`@nxgt/openapi-httpyz`](https://github.com/softistx/nxgt-http/blob/develop/packages/openapi-httpyz/README.md) reads to type a
client over [`@nxgt/httpyz`](https://github.com/softistx/nxgt-http/blob/develop/packages/httpyz/README.md).
The `operations` table carries it in its type, so
`createOpenApiClient(http, operations)` is typed from the table alone.
A reply of server-sent events or JSON Lines is described an item at a time,
from OpenAPI 3.2's `itemSchema`: each event is typed and validated by its
name ([Streams](docs/guide/generated-code.md#streams)).

`$ref`s are followed across files by relative path, including into
`node_modules` (`../node_modules/@acme/fragments/Error.yaml`). A remote or
URN `$ref` is refused.

### Validate with the generated code

```ts
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
import { generate } from '@nxgt/openapi-codegen';

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

### Read the spec with the pipeline stages

For tools built on the spec, the stages `generate()` runs are exported:

```ts
import { buildIR, loadDocument } from '@nxgt/openapi-codegen';

const doc = await loadDocument('openapi/openapi.yaml');
const ir = buildIR(doc);
for (const op of ir.operations) console.log(op.method, op.path, op.operationId);
```

`loadDocument` reads every file and checks every `$ref`; `buildIR` reduces
the spec to one shape per schema and operation; `withValidationErrors`
declares the engine's 400, as `generate()` does unless
`validationErrors: false`. Pass
`{ fs: createMemoryFileSystem({ '/spec/openapi.yaml': text }) }` to read a
spec that is not on disk. [The architecture](docs/architecture/overview.md)
describes each stage.

## API

### `@nxgt/openapi-codegen`

#### Functions

##### `generate`

```ts
function generate(
	options: GenerateOptions & { check?: boolean },
	context?: GenerateContext,
): Promise<GenerateResult>;
```

Generates the files and writes those whose content changed; a file already
as generated is not touched. It deletes a file an earlier run generated and
this one does not, when it still starts with the generated header. See
[Generate](#generate) and [Fail CI](#fail-ci-when-the-generated-code-is-stale).

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `input` | `string` | required | the spec's root document: `openapi.yaml`, or one that `$ref`s the rest. `.json` is read as JSON, anything else as YAML 1.2 |
| `output` | `string` | `'generated/openapi'` | the directory the files are written to |
| `unknownKeys` | `'strip' \| 'strict' \| 'loose'` | `'strip'` | what an object does with keys it does not declare, where the spec does not say with `additionalProperties` ([more](docs/guide/options.md#unknownkeys)) |
| `importExtension` | `'' \| '.js' \| '.ts'` | `'.js'` | appended to imports between generated files ([more](docs/guide/options.md#importextension)) |
| `enums` | `'object' \| 'union'` | `'object'` | a named enum as an `as const` object that `z.enum()` reuses, or a plain union ([more](docs/guide/options.md#enums)) |
| `hono` | `boolean` | `false` | also write `hono.ts`; `hono` and `@nxgt/openapi-hono` become runtime dependencies ([more](docs/guide/options.md#hono)) |
| `dates` | `'string' \| 'date'` | `'string'` | a `date-time` kept as its string, or decoded to a `Date` by a `z.codec` ([more](docs/guide/options.md#dates)) |
| `lint` | `boolean \| string` | `false` | lint with Redocly first: `true` uses the `redocly.yaml` beside `input` or Redocly's defaults, a string names the config file. Needs `@redocly/openapi-core`; cannot be combined with `context.fs` ([more](docs/guide/options.md#lint)) |
| `names` | `Record<string, string>` | `{}` | renames schemas, keyed by file relative to the root document plus `#pointer` when the schema is not the whole file ([more](docs/guide/options.md#names)) |
| `legacyNullable` | `'warn' \| 'error'` | `'warn'` | OpenAPI 3.0's `nullable: true`: read with a warning, or refused ([more](docs/guide/options.md#legacynullable)) |
| `validationErrors` | `boolean` | `true` | declare, on each operation that takes a parameter or a body, the 400 `@nxgt/openapi-hono` answers a refused request with, as `ValidationErrorBody` ([more](docs/guide/options.md#validationerrors)) |
| `check` | `boolean` | `false` | write nothing; list in `drifted` every file that is missing, stale, or generated before and no longer generated |

| Context | Type | Default | Description |
| --- | --- | --- | --- |
| `cwd` | `string` | `process.cwd()` | what relative paths in the options resolve against |
| `fs` | `FileSystem` | `nodeFileSystem` | how the spec is read. The files are always written to the real disk |

Returns a [`GenerateResult`](#generateresult). Throws a
[`CodegenError`](#codegenerror): `invalid_option` for an option value it
does not know, then every error of the stage that failed (loading, lint,
building the IR, emitting). A file system error while writing is rethrown
as is.

##### `generateFiles`

```ts
function generateFiles(
	options: GenerateOptions,
	context?: GenerateContext,
): Promise<{ files: GeneratedFile[]; warnings: Diagnostic[] }>;
```

The same run as `generate()`, `check` aside, returning the files in memory
instead of writing them. Each `path` is absolute, under `output`. Throws as
`generate()` does. See [In memory](docs/guide/options.md#in-memory-generatefiles).

##### `defineConfig`

```ts
function defineConfig<const T extends CodegenConfig>(config: T): T;
function defineConfig(
	configs: readonly CodegenConfig[],
	shared?: SharedConfig,
): CodegenConfig[];
```

Types a config file. One config comes back unchanged: `shared` is for a
list, and TypeScript refuses it next to a single config. With a list, `shared`
is laid under every entry: an entry's own option wins, and `names` merge,
the entry's winning per key. Throws a `CodegenError` (`invalid_config`) when
`shared` sets `input` or `output`. See [Setup](#setup).

##### `loadConfig`

```ts
function loadConfig(path?: string, cwd?: string): Promise<LoadedConfig>;
```

Finds, imports and checks a config file the way the command line does:
`path` when given, else the first of [`CONFIG_FILES`](#config_files) in
`cwd` (default `process.cwd()`). Returns a [`LoadedConfig`](#loadedconfig).
Throws a `CodegenError` (`invalid_config`) when there is no file, when it
cannot be imported, when its default export is not a config or a list of
them, when a config holds a key that is not an option (`check` included),
or when two configs write to the same directory.

##### `formatDiagnostic`

```ts
function formatDiagnostic(d: Diagnostic, baseDir?: string): string;
```

One diagnostic on one line, as `CodegenError` and the command line print it:
`error paths/employees.yaml#/get/responses/200/$ref: … [pointer_not_found]`,
or `file:line:column: …` when the line is known. `file` is shown relative to
`baseDir` when given.

##### `loadDocument`

```ts
function loadDocument(
	path: string,
	options?: LoadOptions,
): Promise<LoadedDocument>;
```

Loads a spec, one file or a root that `$ref`s into many, and checks every
`$ref` reachable from it. Returns a [`LoadedDocument`](#loadeddocument).
Throws one `CodegenError` listing every problem: a missing file, a parse
error, a broken or remote `$ref`, a `$ref` cycle, an OpenAPI version other
than 3.1 or 3.2. See [Read the spec](#read-the-spec-with-the-pipeline-stages).

##### `buildIR`

```ts
function buildIR(doc: LoadedDocument, options?: IROptions): ApiIR;
```

What a loaded spec means: every named schema, in the order it can be
emitted, and every operation. Returns an [`ApiIR`](#apiir). Throws one
`CodegenError` listing everything the generator cannot express faithfully.
It never approximates silently.

##### `withValidationErrors`

```ts
function withValidationErrors(ir: ApiIR, root: Location): ApiIR;
```

`ir` with the 400 `@nxgt/openapi-hono` answers a refused request with
declared on each operation that takes a parameter or a body, alone or in a
union with the schema of the spec's own 400, and its body added to the
schemas as `ValidationErrorBody`; `root` is the spec's root
document, `doc.entry`. It returns `ir` itself when no operation takes an
input. `generate()` runs it unless `validationErrors: false`; see
[the option](docs/guide/options.md#validationerrors).

##### `createMemoryFileSystem`

```ts
function createMemoryFileSystem(
	files: Record<string, string>,
	links?: Record<string, string>,
): FileSystem;
```

An in-memory [`FileSystem`](#filesystem), for tests and for a spec that
never touched a disk. `files` maps an absolute path to its text; `links`
maps a directory to the directory it points at, the way a workspace symlinks
a package into `node_modules`. A missing file rejects with `code: 'ENOENT'`.

#### Constants

##### `DEFAULT_OUTPUT`

```ts
const DEFAULT_OUTPUT: 'generated/openapi';
```

Where the files go when no `output` is given, relative to `cwd` or to the
config file.

##### `CONFIG_FILES`

```ts
const CONFIG_FILES: readonly [
	'openapi-codegen.config.ts',
	'openapi-codegen.config.mts',
	'openapi-codegen.config.js',
	'openapi-codegen.config.mjs',
];
```

The config files `loadConfig` and the command line look for, in this order,
when none is named.

##### `HTTP_METHODS`

```ts
const HTTP_METHODS: readonly [
	'get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace', 'query',
];
```

Every method an operation may have, OpenAPI 3.2's `query` included.

##### `VALIDATION_ERROR_BODY`

```ts
const VALIDATION_ERROR_BODY: 'ValidationErrorBody';
```

The name `withValidationErrors` declares the engine's 400 body under:
`ValidationErrorBody` in `types.ts`, `zValidationErrorBody` in `zod.ts`.

##### `nodeFileSystem`

```ts
const nodeFileSystem: FileSystem;
```

The real disk, the default `fs` of `generate()` and `loadDocument()`. It
reads with `Bun.file` and resolves symlinks with `realpath`.

#### Classes

##### `CodegenError`

```ts
class CodegenError extends Error {
	constructor(diagnostics: readonly Diagnostic[], baseDir?: string);
}
```

Thrown once, with every error found, rather than at the first one: a spec
split over forty files is fixed in one pass. See
[Report what cannot be generated](#report-what-cannot-be-generated).

| Member | Type | Description |
| --- | --- | --- |
| `name` | `'CodegenError'` | |
| `message` | `string` | `N error(s) in the OpenAPI document:` then one line per error, as `formatDiagnostic` prints it relative to `baseDir` |
| `diagnostics` | `readonly Diagnostic[]` | every diagnostic passed in, warnings included |

##### `Resolver`

```ts
class Resolver {
	constructor(fs: FileSystem);
}
```

Loads the files of a spec and resolves `$ref`s between them. `crawl` does
the asynchronous part once, collecting every problem into `diagnostics`
rather than throwing, so `get`, `target` and `deref` are synchronous after
it. A relative `$ref` resolves against the real path of the file it is
written in. `loadDocument` builds one; `LoadedDocument.resolver` is it.

| Member | Type | Description |
| --- | --- | --- |
| `diagnostics` | `Diagnostics` | every problem found while loading and crawling |
| `files` | `ReadonlyMap<string, Record<string, unknown>>` | every file loaded so far, by real path |
| `load(path, site?)` | `(path: string, site?: Location) => Promise<Location \| undefined>` | reads one file; `undefined`, with a diagnostic, when it is missing or cannot be parsed |
| `crawl(start)` | `(start: Location) => Promise<void>` | loads everything reachable from `start` and checks every `$ref` on the way, cycles included |
| `get(at)` | `(at: Location) => unknown` | the node at `at`; throws for a location the crawl did not reach |
| `target(ref, file)` | `(ref: string, file: string) => Location` | where a `$ref` written in `file` lands; throws for a `$ref` the crawl did not see |
| `deref(value, at)` | `<T = unknown>(value: unknown, at: Location) => Resolved<T>` | follows `value` through every pure `$ref` to the node it stands for |

#### Types

##### `GenerateOptions`

```ts
interface GenerateOptions extends IROptions {
	input: string;
	output?: string;
	unknownKeys?: UnknownKeys;
	importExtension?: '' | '.js' | '.ts';
	enums?: Enums;
	hono?: boolean;
	dates?: Dates;
	lint?: Lint;
	validationErrors?: boolean;
}
```

The options of `generate()` and `generateFiles()`, described under
[`generate`](#generate); `names` and `legacyNullable` come from `IROptions`.

##### `GenerateContext`

```ts
interface GenerateContext {
	cwd?: string;
	fs?: FileSystem;
}
```

The second argument of `generate()` and `generateFiles()`, described under
[`generate`](#generate).

##### `GenerateResult`

| Field | Type | Description |
| --- | --- | --- |
| `written` | `string[]` | files written, absolute |
| `unchanged` | `string[]` | files already as generated, so not touched: a watcher sees no change |
| `drifted` | `string[]` | with `check`: files that differ, are missing, or were generated before and no longer are |
| `removed` | `string[]` | files an earlier run generated that this one does not: deleted |
| `warnings` | `Diagnostic[]` | what the spec uses that the generated code does not enforce, or ignores |

What `generate()` returns.

##### `GeneratedFile`

```ts
interface GeneratedFile {
	path: string;
	content: string;
}
```

One file `generateFiles()` returns; `path` is absolute.

##### `CodegenConfig`

```ts
type CodegenConfig = GenerateOptions;
```

One spec of a config file: the options of `generate()`. `check` is the
`--check` flag, not a config key.

##### `SharedConfig`

```ts
type SharedConfig = Omit<CodegenConfig, 'input' | 'output'>;
```

What the entries of a config list share: the second argument of
`defineConfig`.

##### `LoadedConfig`

| Field | Type | Description |
| --- | --- | --- |
| `file` | `string` | the config file, absolute. Relative paths in `configs` resolve against its directory |
| `configs` | `CodegenConfig[]` | every spec it lists, `shared` already merged in |

What `loadConfig` returns.

##### `UnknownKeys`

```ts
type UnknownKeys = 'strip' | 'strict' | 'loose';
```

The `unknownKeys` option.

##### `Enums`

```ts
type Enums = 'object' | 'union';
```

The `enums` option.

##### `Dates`

```ts
type Dates = 'string' | 'date';
```

The `dates` option.

##### `Lint`

```ts
type Lint = boolean | string;
```

The `lint` option: `true` for the `redocly.yaml` beside the spec or
Redocly's defaults, a string for that config file.

##### `IROptions`

| Field | Type | Description |
| --- | --- | --- |
| `names` | `Record<string, string>` | renames schemas: `{ 'components/schemas/Error.yaml': 'ApiError' }` |
| `legacyNullable` | `'warn' \| 'error'` | OpenAPI 3.0's `nullable: true`, read as `type: [T, 'null']` with a warning, or refused. Default `'warn'` |

The second argument of `buildIR`, and part of `GenerateOptions`.

##### `Diagnostic`

| Field | Type | Description |
| --- | --- | --- |
| `severity` | `Severity` | `'error'` or `'warning'` |
| `code` | `DiagnosticCode` | stable: match on it, not on the wording |
| `message` | `string` | |
| `file` | `string`, optional | absolute path of the file the problem is in |
| `pointer` | `string`, optional | JSON pointer inside `file`; `''` is the document root |
| `line`, `column` | `number`, optional | 1-based; only a `lint` problem knows them |

One problem, in `CodegenError.diagnostics` and `GenerateResult.warnings`.

##### `DiagnosticCode`

```ts
type DiagnosticCode =
	| 'file_not_found' | 'parse_error' | 'invalid_root' | 'invalid_ref'
	| 'remote_ref' | 'pointer_not_found' | 'ref_cycle' | 'missing_version'
	| 'unsupported_version' | 'invalid_schema' | 'invalid_option'
	| 'invalid_config' | 'unsupported_keyword' | 'legacy_nullable'
	| 'unknown_format' | 'not_enforced' | 'discriminator_fallback'
	| 'name_collision' | 'invalid_operation' | 'unsupported_operation'
	| 'unsupported_parameter' | 'path_parameter_mismatch'
	| 'missing_operation_id' | 'duplicate_operation_id' | 'ignored'
	| 'lint_error' | 'lint_warning';
```

Every code a `Diagnostic` may carry. [Diagnostics](docs/guide/diagnostics.md)
explains each.

##### `Severity`

```ts
type Severity = 'error' | 'warning';
```

An error stops the run; a warning comes back in `warnings`.

##### `Diagnostics`

| Member | Type | Description |
| --- | --- | --- |
| `list` | `Diagnostic[]` | every diagnostic collected |
| `error(code, message, at?)` | `(code: DiagnosticCode, message: string, at?: Location) => void` | adds an error |
| `warning(code, message, at?)` | `(code: DiagnosticCode, message: string, at?: Location) => void` | adds a warning |
| `hasErrors` | `boolean` | whether any is an error |
| `warnings` | `Diagnostic[]` | the warnings only |

Collects diagnostics while a pass runs, as `Resolver.diagnostics`. Exported
as a type only.

##### `LoadOptions`

| Field | Type | Description |
| --- | --- | --- |
| `fs` | `FileSystem`, optional | default `nodeFileSystem` |
| `cwd` | `string`, optional | what a relative `path` resolves against; default `process.cwd()` |

The second argument of `loadDocument`.

##### `LoadedDocument`

| Field | Type | Description |
| --- | --- | --- |
| `entry` | `Location` | the root document |
| `openapi` | `string` | the `openapi` field as written, e.g. `3.2.0` |
| `version` | `OpenApiVersion` | `'3.1'` or `'3.2'` |
| `document` | `Record<string, unknown>` | the root document, parsed |
| `resolver` | `Resolver` | every reachable file already loaded, so it is synchronous from here |
| `warnings` | `Diagnostic[]` | what loading warned about |

What `loadDocument` returns, and `buildIR` takes.

##### `OpenApiVersion`

```ts
type OpenApiVersion = '3.1' | '3.2';
```

The versions the loader accepts, in `LoadedDocument.version`.

##### `FileSystem`

```ts
interface FileSystem {
	readText(path: string): Promise<string>;
	/** Resolves symlinks; rejects with `code: 'ENOENT'` for a missing file. */
	realpath(path: string): Promise<string>;
}
```

What the loader needs from a disk: the `fs` of `generate()`,
`loadDocument()` and `new Resolver()`. Files are keyed by real path, so a
fragment reached through a symlink and through its own path is loaded once.

##### `Location`

```ts
interface Location {
	readonly file: string;
	readonly pointer: string;
}
```

A node in a loaded file: its real path and a JSON pointer into it. Every IR
node that can be reported on carries one.

##### `Resolved`

| Field | Type | Description |
| --- | --- | --- |
| `value` | `T` | the node, after every `$ref` hop |
| `location` | `Location` | where `value` really lives |
| `id` | `string` | `file#pointer`: equal for every route to the same node |
| `hops` | `Location[]` | where each hop landed, in order; empty when `value` was no reference |
| `summary`, `description` | `string`, optional | written next to the outermost `$ref` that has one; they override the target's |

What `Resolver.deref<T>()` returns: `Resolved<Schema>` is a schema and where
it came from.

##### `ApiIR`

| Field | Type | Description |
| --- | --- | --- |
| `openapi` | `string` | the `openapi` field as written |
| `version` | `'3.1' \| '3.2'` | |
| `title`, `apiVersion` | `string`, optional | `info.title` and `info.version` |
| `schemas` | `NamedSchema[]` | dependencies before dependents; members of a cycle are marked `recursive` |
| `aliases` | `Alias[]` | second `components.schemas` keys for a schema already named |
| `operations` | `OperationIR[]` | |
| `warnings` | `Diagnostic[]` | |

What `buildIR` returns: the spec with every `$ref` resolved and every JSON
Schema spelling reduced to one shape. The type and Zod emitters read this
and nothing else.

##### `NamedSchema`

| Field | Type | Description |
| --- | --- | --- |
| `id` | `string` | the canonical location id of the node it names |
| `name` | `string` | the generated name: `Employee` gives `zEmployee` |
| `location` | `Location` | |
| `source` | `'component' \| 'ref' \| 'inline'` | a `components.schemas` key, a `$ref`'d file, or a body or response written inline |
| `node` | `SchemaNode` | |
| `recursive` | `boolean` | part of a reference cycle, so its validator is built lazily |

One entry of `ApiIR.schemas`.

##### `Alias`

```ts
interface Alias {
	name: string;
	target: string;
	location: Location;
}
```

A second `components.schemas` key standing for a schema already named, in
`ApiIR.aliases`; `target` is that schema's id.

##### `OperationIR`

| Field | Type | Description |
| --- | --- | --- |
| `operationId` | `string` | |
| `name` | `string` | `operationId` in PascalCase, the stem of every name generated for it |
| `method` | `HttpMethod` | |
| `path` | `string` | as the spec writes it: `/employees/{id}` |
| `honoPath` | `string` | as Hono routes it: `/employees/:id` |
| `summary`, `description` | `string \| undefined` | |
| `deprecated` | `boolean` | |
| `tags` | `string[]` | |
| `parameters` | `ParamIR[]` | |
| `body` | `BodyIR \| undefined` | |
| `responses` | `ResponseIR[]` | |
| `location` | `Location` | |

One entry of `ApiIR.operations`.

##### `HttpMethod`

```ts
type HttpMethod = (typeof HTTP_METHODS)[number]; // 'get' | 'put' | … | 'query'
```

An operation's method, in `OperationIR.method`.

##### `ParamIR`

| Field | Type | Description |
| --- | --- | --- |
| `name` | `string` | |
| `in` | `ParamLocation` | |
| `required` | `boolean` | |
| `explode` | `boolean` | a query list as `?a=1&a=2` (`true`) or `?a=1,2` (`false`) |
| `schema` | `SchemaNode` | |
| `description` | `string \| undefined` | |
| `deprecated` | `boolean \| undefined` | |
| `location` | `Location` | |

One parameter of `OperationIR.parameters`.

##### `ParamLocation`

```ts
type ParamLocation = 'path' | 'query' | 'header';
```

Where a parameter goes. Cookie parameters are refused.

##### `BodyIR`

```ts
interface BodyIR {
	required: boolean;
	description?: string;
	content: MediaIR[];
}
```

A request body, in `OperationIR.body`.

##### `ResponseIR`

```ts
interface ResponseIR {
	status: number;
	description?: string;
	content: MediaIR[];
	location: Location;
}
```

One response of `OperationIR.responses`, by exact status.

##### `MediaIR`

| Field | Type | Description |
| --- | --- | --- |
| `mediaType` | `string` | `application/json`, `text/event-stream`… |
| `kind` | `MediaKind` | |
| `schema` | `SchemaNode \| undefined` | absent for binary content, passed through unvalidated, and for a stream |
| `events` | `{ name: string; data?: SchemaNode }[] \| undefined` | `sse`: the events its `itemSchema` declares; `data` is absent when it is text. Absent: any event, as text |
| `item` | `SchemaNode \| undefined` | `jsonl`: each item. Absent: any JSON |

One media type of a `BodyIR` or `ResponseIR`.

##### `MediaKind`

```ts
type MediaKind = 'json' | 'form' | 'text' | 'binary' | 'sse' | 'jsonl';
```

How a media type is read: `sse` and `jsonl` are replies read an item at a
time.

##### `SchemaNode`

```ts
type SchemaNode =
	| RefNode | StringNode | NumberNode | SimpleNode | LiteralNode
	| ArrayNode | ObjectNode | RecordNode | UnionNode | IntersectionNode;
```

One schema, reduced to one shape; switch on `kind`.

##### `Annotations`

```ts
interface Annotations {
	nullable?: boolean;
	description?: string;
	deprecated?: boolean;
	readOnly?: boolean;
	writeOnly?: boolean;
	/** Boxed: `null` is a real default, `undefined` is none. */
	default?: { value: unknown };
}
```

What every `SchemaNode` carries beside its `kind`.

##### `RefNode`

```ts
interface RefNode extends Annotations {
	kind: 'ref';
	target: string;
	sealed?: boolean;
}
```

A named schema, by the id of the node it names. `sealed`: under
`unevaluatedProperties: false`, the target must refuse keys it does not
declare.

##### `StringNode`

```ts
interface StringNode extends Annotations {
	kind: 'string';
	format?: StringFormat;
	minLength?: number;
	maxLength?: number;
	pattern?: string;
}
```

A string, with the constraints the validator enforces.

##### `StringFormat`

```ts
type StringFormat =
	| 'date-time' | 'date' | 'time' | 'duration' | 'email'
	| 'uri' | 'uuid' | 'ipv4' | 'ipv6' | 'byte';
```

The string formats that are validated; `byte` is base64. Another format is
an `unknown_format` warning.

##### `NumberNode`

```ts
interface NumberNode extends Annotations {
	kind: 'number';
	integer: boolean;
	format?: NumberFormat;
	minimum?: number;
	maximum?: number;
	exclusiveMinimum?: number;
	exclusiveMaximum?: number;
	multipleOf?: number;
}
```

A number or, with `integer`, an integer.

##### `NumberFormat`

```ts
type NumberFormat = 'int32' | 'int64' | 'float' | 'double';
```

The format of a `NumberNode`.

##### `SimpleNode`

```ts
interface SimpleNode extends Annotations {
	kind: 'boolean' | 'null' | 'binary' | 'unknown' | 'never';
}
```

A schema with nothing more to say. `binary` is raw content, a file upload or
an octet stream, never JSON.

##### `LiteralNode`

```ts
interface LiteralNode extends Annotations {
	kind: 'literal';
	values: Scalar[];
	names?: string[];
}
```

An `enum` or `const`. `names` holds a member name per value, from
`x-enum-varnames` or `x-enumNames`.

##### `Scalar`

```ts
type Scalar = string | number | boolean | null;
```

A value of a `LiteralNode`.

##### `ArrayNode`

```ts
interface ArrayNode extends Annotations {
	kind: 'array';
	items: SchemaNode;
	minItems?: number;
	maxItems?: number;
}
```

A list of one item schema; tuples are refused.

##### `ObjectNode`

```ts
interface ObjectNode extends Annotations {
	kind: 'object';
	properties: Property[];
	additional: Additional;
	extends: string[];
	requires?: string[];
}
```

An object. `extends` names the object schemas it builds on through `allOf`;
`requires` lists properties of a parent it makes required.

##### `Property`

```ts
interface Property {
	name: string;
	required: boolean;
	schema: SchemaNode;
}
```

One property of an `ObjectNode`.

##### `Additional`

```ts
type Additional = 'default' | 'strict' | 'loose' | { schema: SchemaNode };
```

What an object does with keys it does not declare. `'default'` is the
spec's silence, which the `unknownKeys` option decides:
`additionalProperties: { type: string }` is `{ schema: StringNode }`.

##### `RecordNode`

```ts
interface RecordNode extends Annotations {
	kind: 'record';
	values: SchemaNode;
}
```

A map of any keys to one value schema.

##### `UnionNode`

```ts
interface UnionNode extends Annotations {
	kind: 'union';
	variants: SchemaNode[];
	exclusive: boolean;
	discriminator?: string;
	sealed?: boolean;
}
```

A `oneOf` (`exclusive`, recorded, not enforced) or `anyOf`.
`discriminator` is set only when every variant is an object with a constant
for it.

##### `IntersectionNode`

```ts
interface IntersectionNode extends Annotations {
	kind: 'intersection';
	members: SchemaNode[];
	sealed?: boolean;
}
```

An `allOf` that is not just objects extending one another. `sealed`: under
`unevaluatedProperties: false`, every member refuses the keys no member
declares.

### CLI: `nxgt-openapi`

```
nxgt-openapi generate [options]
```

`generate` is the only command. It runs `generate()` for each spec of a
config file, or for the one spec named by `--input`. It runs on Bun.

| Flag | Description |
| --- | --- |
| `-c, --config <file>` | the config file. Default: the first of `openapi-codegen.config.ts`, `.mts`, `.js`, `.mjs` in the current directory |
| `-i, --input <file>` | the spec's root document, instead of a config file; relative to the current directory |
| `-o, --output <dir>` | where the files go, with `--input` only. Default `generated/openapi` |
| `--check` | write nothing; list what is missing, stale, or generated before and no longer generated, and exit 1 |
| `--lint` | lint each spec with Redocly first, as `lint: true` does; a config's own `lint` file is kept. Needs `@redocly/openapi-core` |
| `-h, --help` | print the usage and exit 0 |
| `-v, --version` | print the package's version and exit 0 |

It prints one line per spec, `openapi/openapi.yaml → src/generated: 2
written, 2 unchanged` (`, 1 removed` when a file is deleted), or with
`--check`, `up to date` or `out of date` followed by the files. Warnings and
errors go to stderr, one per line, as `formatDiagnostic` prints them; a file
that cannot be read or written prints as `error <message>`. A spec that fails
does not stop the others.

| Exit code | When |
| --- | --- |
| 0 | generated, or `--check` found everything up to date |
| 1 | a spec cannot be generated, the config file is missing or invalid (`invalid_config`), a file cannot be written, or `--check` found drift |
| 2 | the command line is wrong: no command, an unknown command or flag, an empty path, `--output` without `--input`, or `--config` with `--input` or `--output` |

See [the command line](docs/guide/cli.md).

### Generated files

What an app imports from `output`. [The generated code](docs/guide/generated-code.md)
shows each in full.

| File | Exports |
| --- | --- |
| `types.ts` | per schema, `interface` or `type <Name>`, and `<Name>Input` where defaults make input differ; a second `components.schemas` key for a named schema, as an alias; per named enum of two or more strings or numbers, `const <Name>` (with `enums: 'object'`); per operation, `<Operation>Param`, `<Operation>Query`, `<Operation>Header`, and an inline body or reply named `<Operation>Body`, `<Operation><status>Response`; `Operations`, `ClientOperations`, `OperationsByRoute`, `PathsByMethod`, `OperationsByTag`, `PathsByTag`; `Wire<T>` with `dates: 'date'`; `ValidationErrorBody`, the engine's 400, unless `validationErrors: false` or no operation takes an input |
| `zod.ts` | `z<Name>`, a validator per schema, `zValidationErrorBody` included |
| `operations.ts` | `operations`; `z<Operation>Param`, `z<Operation>Query`, `z<Operation>Header`, `z<Operation>Form`; the types `OperationSpec`, `MediaSpec`, `ParameterSpec` |
| `paths.ts` | `paths`, `operations`, `components`, `webhooks`, `$defs`: the openapi-typescript shape. `webhooks` and `$defs` are always empty, since webhooks are not generated |
| `hono.ts` | `Replies`, `HonoSpec`, `createApi`, `createRoutes`; `streamEvents` and `streamLines` when an operation Hono can route replies with a stream |

- **`Operations`**: each operation keyed by `operationId` as a server sees it:
  `method`, `path`, `honoPath`, `param`, `query`, `header`, `json` or `form`,
  `responses` (status → media type → body), and `stream`.
- **`ClientOperations`**: the same as a client calls it: `method`, `path`,
  `args`, `reply` (`{ status, type, data }`), `wire`, and `stream`. Read by
  `@nxgt/openapi-httpyz`.
- **`OperationsByRoute`**: `'put /employees/{id}'` → `'updateEmployee'`.
  **`PathsByMethod`**: each method → its paths. **`OperationsByTag`**: each
  tag → its operation ids. **`PathsByTag`**: `PathsByMethod` per tag.
- **`Wire<T>`**: `T` as JSON carries it, each `Date` a `string`:
  `Wire<{ at: Date }>` is `{ at: string }`.
- **`operations`**: typed
  `{ readonly [K in keyof Operations]: OperationSpec<ClientOperations[K]> }`.

```ts
interface OperationSpec<Client = unknown> {
	readonly method: 'get' | 'put' | 'post' | 'delete' | 'options' | 'head' | 'patch' | 'trace' | 'query';
	readonly path: string;
	readonly honoPath: string;
	readonly tags: readonly string[];
	readonly parameters: readonly ParameterSpec[];
	readonly param: z.ZodType; // path parameters, each read as a string
	readonly query: z.ZodType; // a string per parameter, or every value of a list
	readonly header: z.ZodType; // keyed by lowercased name
	readonly body?: {
		readonly required: boolean;
		readonly content: { readonly [mediaType: string]: MediaSpec };
	};
	readonly responses: {
		readonly [status: number]: { readonly [mediaType: string]: MediaSpec };
	};
	readonly '~client'?: Client; // never set: carries the client types
}

interface MediaSpec {
	readonly kind: 'json' | 'form' | 'text' | 'binary' | 'sse' | 'jsonl';
	readonly schema?: z.ZodType; // absent for binary content and streams
	readonly events?: { readonly [event: string]: z.ZodType | null }; // sse: null for text data
	readonly item?: z.ZodType; // jsonl
}

interface ParameterSpec {
	readonly name: string;
	readonly in: 'path' | 'query' | 'header';
	readonly required: boolean;
	readonly explode: boolean;
	readonly list: boolean; // validated as a list
}
```

`hono.ts` binds `@nxgt/openapi-hono` to the spec:

```ts
const createApi: (options?: ApiOptions) => Api<HonoSpec>;
const createRoutes: <Prefix extends string = '', Tag extends keyof OperationsByTag & string = never>(
	app: Hono<any, any, any>, // a sub-app with an env of its own too
	options?: RoutesOptions<Prefix, Tag>,
) => Routes<HonoSpec, ScopeOf<HonoSpec, Tag>, Prefix>;
const streamEvents: <Id extends /* operations replying with events */>(
	c: Context,
	id: Id,
	write: (stream: EventWriter<Operations[Id]['stream']['item']>) => Promise<void>,
) => Replies[Id];
// streamLines: the same, with a LineWriter, for JSON Lines
```

`createApi` is one registry for the whole spec; `createRoutes` puts routes
on one app, with a registry of its own. See
[Typed Hono routes](https://github.com/softistx/nxgt-http/blob/develop/packages/openapi-hono/docs/guide.md).

## Traps

- **The generator runs on Bun**, the bin and `generate()` alike: it reads
  YAML with `Bun.YAML`, and the bin starts with `#!/usr/bin/env bun`. Run it
  with `bunx`, or with Bun on the `PATH`.
- **OpenAPI 3.1 and 3.2 only.** A 3.0 or Swagger 2.0 document is refused;
  convert it. 3.0's `nullable: true` is read with a warning, and
  `legacyNullable: 'error'` refuses it.
- **Unsupported JSON Schema is an error, not a guess.** `not`,
  `if`/`then`/`else`, `patternProperties`, tuples and cookie parameters fail
  the run, each at its pointer ([the full list](docs/guide/schema-mapping.md#refused)).
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

- [getting started](docs/guide/getting-started.md): install, generate, use,
  keep in step in CI;
- [the command line](docs/guide/cli.md): flags, config files, exit codes;
- [options](docs/guide/options.md): every option of `generate()`;
- [the generated code](docs/guide/generated-code.md): what each file holds;
- [how schemas map](docs/guide/schema-mapping.md): each JSON Schema keyword,
  and what is refused;
- [diagnostics](docs/guide/diagnostics.md): every diagnostic code;
- [typed Hono routes](https://github.com/softistx/nxgt-http/blob/develop/packages/openapi-hono/docs/guide.md), in
  `@nxgt/openapi-hono`: routes, validation errors, modules, reply checks;
- [the architecture](docs/architecture/overview.md), for working on the
  generator.
