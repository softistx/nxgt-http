# Options

```ts
import { generate } from '@nxgt/openapi-codegen';

await generate({
	input: 'openapi/openapi.yaml',
	output: 'src/generated',
	unknownKeys: 'strip',
	importExtension: '.js',
	enums: 'object',
	hono: false,
	dates: 'string',
	lint: false,
	names: { 'components/schemas/Error.yaml': 'ApiError' },
	legacyNullable: 'warn',
	check: false,
});
```

| Option | Default | |
| --- | --- | --- |
| `input` | required | the root document of the spec |
| `output` | `'generated/openapi'` | the directory the files are written to |
| [`unknownKeys`](#unknownkeys) | `'strip'` | what an object does with keys it does not declare |
| [`importExtension`](#importextension) | `'.js'` | how generated files import each other |
| [`enums`](#enums) | `'object'` | a named enum as an `as const` object, or a plain union |
| [`hono`](#hono) | `false` | also write `hono.ts`: typed routes for a Hono app |
| [`dates`](#dates) | `'string'` | a `date-time` as its string, or decoded to a `Date` |
| [`lint`](#lint) | `false` | lint the spec with Redocly before generating |
| [`names`](#names) | `{}` | renames schemas |
| [`legacyNullable`](#legacynullable) | `'warn'` | tolerate or refuse 3.0's `nullable: true` |
| `check` | `false` | write nothing, report in `drifted` what would change |

A [config file](cli.md#config-file) takes the same options, `check` aside,
and resolves its paths against its own directory.

Relative paths resolve against the current directory. Pass `{ cwd }` as a
second argument to change that. `{ fs }` replaces how the spec is read, for
example with `createMemoryFileSystem({ '/spec/openapi.yaml': '…' })` in a
test. The files are always written to the real disk.

## `unknownKeys`

What an object does with keys it does not declare, where the spec does not
say with `additionalProperties`:

| Value | Validator | Keys it does not declare |
| --- | --- | --- |
| `'strip'` | `z.object()` | dropped from the result |
| `'strict'` | `z.strictObject()` | refused |
| `'loose'` | `z.looseObject()` | kept; the type gains `[key: string]: unknown` |

`additionalProperties: false` is always strict, `true` always loose, and a
schema always validates the extra keys against it, whatever this option says.

An intersection, such as an `allOf` of an object and a union, refuses a key
only when every member refuses it. Under `'strict'`, every member is strict,
so the intersection refuses exactly the keys that no member declares. An
`additionalProperties: false` on a member whose siblings strip refuses
nothing. Its extra keys are dropped, and a `not_enforced` warning says so.

## `importExtension`

How the generated files import each other (`types`, `zod`,
`operations`):

| Value | Import | Works with |
| --- | --- | --- |
| `'.js'` | `'./types.js'` | every `moduleResolution`, Node's included |
| `''` | `'./types'` | bundlers only |
| `'.ts'` | `'./types.ts'` | `allowImportingTsExtensions` |

## `enums`

A named `enum` of two or more strings or numbers:

| Value | `types.ts` | `zod.ts` |
| --- | --- | --- |
| `'object'` | `export const Status = { Active: 'active', … } as const` and `type Status = 'active' \| …` | `z.enum(Status)` |
| `'union'` | `type Status = 'active' \| …` | `z.enum(['active', …])`, or `z.literal([1, 2])` for numbers |

Either way the type accepts plain literals. `'object'` adds a runtime value
per enum, `Status.Active`, which `zod.ts` imports.

## `hono`

`true` also writes `hono.ts`:
- `Replies`, what each operation may send, as Hono types a reply;
- `createRoutes` and `createApi`, bound to the spec.

The file imports `hono` and `@nxgt/openapi-codegen/hono`, so both become
runtime dependencies of the app. It is off by default, so a project without
Hono gets no file it cannot compile. See [Typed Hono routes](hono.md).

## `dates`

A `format: date-time`:

| Value | Type | Validator |
| --- | --- | --- |
| `'string'` | `string` | `z.iso.datetime({ offset: true })` |
| `'date'` | `Date`; `string` in `XInput` | `z.codec(z.iso.datetime({ offset: true }), z.date(), isoDate)` |

With `'date'`:
- **A validator takes JSON and returns `Date`s.** `zEvent.parse(json)`
  decodes, and `z.encode(zEvent, event)` gives the JSON back, each date as
  `toISOString()` writes it, in UTC. A `Date` passed to `parse` is refused.
- **Every schema that holds a date gets an `XInput`**, with its dates as
  strings, because what the validator accepts now differs from what it
  returns.
- **A default is written in the spec as JSON**, so it goes through the codec
  too: `.prefault('2024-01-01T09:00:00Z')`.
- **What travels is typed as JSON:**
  - `types.ts` exports `Wire<T>`, which turns each `Date` into a
    `string`;
  - `paths.ts` types responses and `components` with it, since
    openapi-fetch decodes nothing;
  - `Replies` types replies with it, since `c.json()` sends a `Date` as its
    string.
- **A schema named `Wire` is a `name_collision`.**

`format: date` stays a string: a day is not an instant, and `new Date()`
would pin it to a time zone.

## `lint`

Runs Redocly's linter over the spec once it has loaded, before anything is
built:

| Value | Redocly config |
| --- | --- |
| `false` | none: no lint |
| `true` | the `redocly.yaml` in the directory of `input`, or Redocly's defaults (its `recommended` rules) when there is none |
| `'path/to/redocly.yaml'` | that file, relative to the current directory, or to the config file's |

- **It needs `@redocly/openapi-core`**, an optional peer: add it to your
  devDependencies. Without it, `lint` is an `invalid_option`.
- **A rule set to `error` stops the run** (`lint_error`); one set to `warn`
  comes back in `warnings` (`lint_warning`). Both point at a line: see
  [Linting](diagnostics.md#linting).
- **It lints, and nothing more.** The generator still reads the `$ref`s and
  names the schemas itself; no Redocly bundle is made, since one renames
  clashing schemas without saying so.
- **It reads the spec from disk**, so it cannot be combined with `{ fs }`.
- **Redocly's defaults are strict**: `recommended` asks for `servers`, a
  `license`, `security` on each operation, and more. A `redocly.yaml` that
  lists only `rules:` runs just those.

## `names`

Schemas are named after their `components.schemas` key or, for a `$ref`'d
file, after the file. When two schemas would get the same name, the run
fails and the error names the key that fixes it:

```
error schemas/employee-status.yaml#: two schemas would both be named EmployeeStatus: this one and openapi.yaml#/components/schemas/EmployeeStatus. Rename one with the `names` option, e.g. names: { 'schemas/employee-status.yaml': 'EmployeeStatus2' } [name_collision]
```

The key is the schema's file relative to the root document, followed by
`#<pointer>` when the schema is not the whole file:

```ts
await generate({
	input: 'openapi/openapi.yaml',
	output: 'src/generated',
	names: {
		'schemas/employee-status.yaml': 'EmploymentStatus',
		'openapi.yaml#/components/schemas/Error': 'ApiError',
	},
});
```

The value must be a valid identifier. `zApiError` and `ApiErrorInput`
follow from it.

## `legacyNullable`

OpenAPI 3.0's `nullable: true` is read as `type: [T, 'null']`, with one
warning per file that uses it. Fragment libraries written for 3.0 are full
of it. Set `'error'` to refuse it instead, once a spec has been converted.

## In memory: `generateFiles`

`generateFiles` takes the same options, without `check`, and returns the
files instead of writing them:

```ts
import { generateFiles } from '@nxgt/openapi-codegen';

const { files, warnings } = await generateFiles({
	input: 'openapi/openapi.yaml',
	output: 'src/generated',
});
for (const file of files) console.log(file.path, file.content.length);
```
