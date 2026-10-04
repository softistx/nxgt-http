# Options

```ts
import { generate } from '@nxgt/openapi-codegen';

await generate({
	input: 'openapi/openapi.yaml',
	output: 'src/generated',
	unknownKeys: 'strip',
	importExtension: '',
	enums: 'object',
	hono: false,
	alxia: false,
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
| [`importExtension`](#importextension) | `''` | how generated files import each other |
| [`enums`](#enums) | `'object'` | a named enum as an `as const` object, or a plain union |
| [`hono`](#hono) | `false` | also write `hono.ts`: typed routes for a Hono app |
| [`alxia`](#alxia) | `false` | also write `alxia.ts`: each operation as the data an alxia app's `app.route(operation, ...middlewares, handler)` takes |
| [`dates`](#dates) | `'string'` | a `date-time` as its string, or decoded to a `Date` |
| [`lint`](#lint) | `false` | lint the spec with Redocly before generating |
| [`names`](#names) | `{}` | renames schemas |
| [`legacyNullable`](#legacynullable) | `'warn'` | tolerate or refuse 3.0's `nullable: true` |
| [`validationErrors`](#validationerrors) | `true` | declare the 400 the server answers a refused request with: `@nxgt/openapi-hono`'s, or alxia's with `alxia` alone |
| `check` | `false` | write nothing, report in `drifted` what would change, a file no longer generated included |

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
| `''` | `'./types'` | a bundler, Bun, `moduleResolution: bundler` |
| `'.js'` | `'./types.js'` | every `moduleResolution`, `nodenext` included |
| `'.ts'` | `'./types.ts'` | `allowImportingTsExtensions` |

An app whose `tsconfig` resolves with `node16` or `nodenext`, or that runs
the files with Node without a bundler, sets `'.js'`: Node's resolution
requires the extension.

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

The file imports `hono` and `@nxgt/openapi-hono`, so both become runtime
dependencies of the app. It is off by default, so a project without Hono
gets no file it cannot compile. See [Typed Hono routes](https://github.com/softistx/nxgt-http/blob/develop/packages/openapi-hono/docs/guide.md).

## `alxia`

`true` also writes `alxia.ts`: one constant per operation, named by its
`operationId`, holding what [alxia](https://github.com/softistx/alxia)'s
`app.route(operation, ...middlewares, handler)` takes, then `operations`,
all of them by `operationId`:

```ts
import { alxia, validate } from '@alxia/core';
import { operations as api } from './generated/alxia';

const app = alxia()
	.route(api.getPet, ({ params, reply }) => reply.ok(pets.get(params.petId)))
	// auth, then the body validated just before the handler
	.route(api.updatePet, auth, ({ params, body, reply }) =>
		reply.ok(pets.update(params.petId, body)),
	)
	// validate(operation) placed first: a bad body gets its 400 before auth runs
	.route(api.createPet, validate(api.createPet), auth, ({ body, reply }) =>
		reply.created(pets.add(body)),
	);
```

The file is plain data: it imports `zod` and `./zod`, and `eventStream`
from `@alxia/core` only when an operation replies with server-sent events.
It needs `@alxia/core` 0.4 or later: its routes take middlewares, and its
`validate` and `responds` are middlewares too. The route runs a `responds`
of the operation's replies first, which checks each reply with a declared
status, a middleware's included, and a `validate` of its request just
before the handler, unless `validate(operation)` stands earlier among the
middlewares. `matchesSpec(app, operations)` from
[`@alxia/openapi`](https://github.com/softistx/alxia/tree/develop/packages/openapi),
formerly `@alxia/openapi-routes`, fails a test while an operation has no
route.

alxia answers a request the schemas refuse with its own 400,
`{ error: 'validation', issues }`, and types it itself. So the 400 that
[`validationErrors`](#validationerrors) declares is never written into
`alxia.ts`, whichever way that option is set; a 400 the spec declares is
kept as the spec writes it.

Cookie parameters are validated as `cookies`, and server-sent events,
named or not, as `eventStream`: see [`alxia.ts`](generated-code.md#alxiats).

An operation alxia cannot route or validate yet is left out, with an
`ignored` warning: a `TRACE`, a path parameter sharing its segment with text
(`/files/{name}.json`) or named with a character other than a letter, a
digit, `_` or `$`, a parameter named twice, a path that matches the same requests as an earlier one
with other parameter names, a binary body, and a reply that is binary, JSON
Lines, a form, or events alxia's `eventStream` cannot send: events the
`itemSchema` does not declare, or one whose data is text, since alxia sends
every event's data as JSON. See
[`alxia.ts`](generated-code.md#alxiats) for what is kept, and how.

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

## `validationErrors`

It changes `types.ts`, `zod.ts`, `operations.ts`, `paths.ts` and `hono.ts`,
never `alxia.ts`: alxia types its own 400 on the route.

The server answers a request its validators refuse with a 400 of its own,
which a spec rarely declares. A client that decodes its replies, as
`@nxgt/openapi-httpyz` does by default, would refuse that reply as one the
spec does not describe. So the generator declares it, as
`ValidationErrorBody` and `zValidationErrorBody`, on each operation that
takes a parameter or a body, the only ones the server checks. Which body
depends on which server the options generate for:

| `hono` | `alxia` | `ValidationErrorBody` |
| --- | --- | --- |
| either | `false` | `@nxgt/openapi-hono`'s `{ status: 400, message, timestamp, issues }`, each issue's `target` one of `param`, `query`, `header`, `json`, `form`, `body`, `response` |
| `false` | `true` | alxia's `{ error: 'validation', issues }`, `@alxia/core`'s `ValidationErrorBody`, each issue `{ target, path, code, message }` with `target` one of `params`, `query`, `headers`, `cookies`, `body`; declared too on an operation that takes only a cookie, which alxia validates |
| `true` | `true` | a union of the two: a client generated from these files cannot tell which server answers, so it accepts either |

```ts
// types.ts, with alxia: true and hono off
export interface ValidationErrorBody {
	error: 'validation';
	issues: {
		target: 'params' | 'query' | 'headers' | 'cookies' | 'body';
		path: (string | number)[];
		code: string;
		message: string;
	}[];
}
```

With both on, the union is the honest default when one spec is served both
ways, during a move from Hono to alxia for one. When it is served by one of
them only, generate for that one: drop the other option, or set
`validationErrors: false` and declare the 400 in the spec, as an app that
answers with a body of its own does.

Where the spec declares a 400 of its own, the body is added beside it:

| The spec's 400 | What is generated |
| --- | --- |
| none | a 400 with `application/json: ValidationErrorBody` |
| with a JSON media type and schema `S` | that media type's schema becomes `S \| ValidationErrorBody` |
| with a JSON media type and no schema | nothing: any JSON is already declared |
| with no JSON media type | `application/json: ValidationErrorBody` added to it |

The JSON media type is the one a client reads the server's
`application/json` reply as: `application/json` itself, then
`application/*`, then `*/*`, then the first JSON one, such as
`application/problem+json`, which a handler's `c.json()` stands for too.

Set `false` when the app answers with a body of its own, through
`@nxgt/openapi-hono`'s `onValidationError` or alxia's `onRefusal`, and
declare that body in the spec instead. A schema of
the spec already named `ValidationErrorBody` is a `name_collision`: rename it
with [`names`](#names).

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
