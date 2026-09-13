# Options

```ts
import { generate } from '@nxgt/openapi-codegen';

await generate({
	input: 'openapi/openapi.yaml',
	output: 'src/generated',
	unknownKeys: 'strip',
	importExtension: '.js',
	enums: 'object',
	names: { 'components/schemas/Error.yaml': 'ApiError' },
	legacyNullable: 'warn',
	check: false,
});
```

| Option | Default | |
| --- | --- | --- |
| `input` | required | the root document of the spec |
| `output` | required | the directory the files are written to |
| [`unknownKeys`](#unknownkeys) | `'strip'` | what an object does with keys it does not declare |
| [`importExtension`](#importextension) | `'.js'` | how generated files import each other |
| [`enums`](#enums) | `'object'` | a named enum as an `as const` object, or a plain union |
| [`names`](#names) | `{}` | renames schemas |
| [`legacyNullable`](#legacynullable) | `'warn'` | tolerate or refuse 3.0's `nullable: true` |
| `check` | `false` | write nothing, report in `drifted` what would change |

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

`zod.gen.ts` and `operations.gen.ts` import `types.gen` and `zod.gen`:

| Value | Import | Works with |
| --- | --- | --- |
| `'.js'` | `'./types.gen.js'` | every `moduleResolution`, Node's included |
| `''` | `'./types.gen'` | bundlers only |
| `'.ts'` | `'./types.gen.ts'` | `allowImportingTsExtensions` |

## `enums`

A named `enum` of two or more strings or numbers:

| Value | `types.gen.ts` | `zod.gen.ts` |
| --- | --- | --- |
| `'object'` | `export const Status = { Active: 'active', … } as const` and `type Status = 'active' \| …` | `z.enum(Status)` |
| `'union'` | `type Status = 'active' \| …` | `z.enum(['active', …])`, or `z.literal([1, 2])` for numbers |

Either way the type accepts plain literals. `'object'` adds a runtime value
per enum, `Status.Active`, which `zod.gen.ts` imports.

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
