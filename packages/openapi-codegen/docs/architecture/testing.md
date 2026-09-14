# Testing

```sh
bun run test       # writes the fixtures, then runs every spec
bun run typecheck  # writes the fixtures, then tsc, agreement checks included
```

Both scripts run `bun run fixtures` first. A bare `bun test src` on a fresh
checkout fails: the runtime specs import generated code that does not exist
yet.

## Layers

| What | Where | Checks |
| --- | --- | --- |
| unit specs | `src/**/*.spec.ts` | one behaviour each: a pointer escape, a mapping row, a refusal |
| IR snapshots | `src/ir/fixtures.spec.ts` | the whole IR of the `split` and `query` fixtures |
| code snapshots | `src/emit/golden.spec.ts` | every generated file of every fixture, `hono.ts` included |
| runtime | `src/emit/zod.spec.ts`, `operations.spec.ts` | the generated validators, run on real values |
| Hono routes | `src/hono/engine.spec.ts` | the fixtures' routes on a real Hono app, through `app.request()`: validation, errors and hooks, QUERY, forms, reply checks, modules, registration mistakes |
| type agreement | `test/generated/<case>/agreement.ts` | `tsc` fails if a type and its validator disagree, form validators included |
| index typing | `test/types/operations.ts` | `Operations` and its indexes resolve as a server reads them |
| routes typing | `test/types/hono.ts` | what `routes` refuses: an undeclared status, a wrong body, a path without that method, an unknown `operationId`, a tag or a path outside the scope |
| routes cost | `src/hono/perf.spec.ts` | `tsc --extendedDiagnostics` on 500 generated routes stays under an instantiation budget |
| openapi-fetch typing | `test/types/paths.ts` | `createClient<paths>()` types requests and replies from `paths.ts` alone |
| command line | `src/cli/run.spec.ts` | flags, config files, `--check` and exit codes through `run()`, and `src/cli.ts` as a process |

## Fixtures

`test/fixtures/<case>/openapi.yaml`:

| Case | Exercises |
| --- | --- |
| `split` | a Redocly-style spec across files, with `$ref`s into `@nxgt/shared-openapi`'s fragments, a recursive `Employee`, and `allOf` |
| `query` | OpenAPI 3.2's `query` method, with an inline body and defaults |
| `kitchen-sink` | one schema per mapping row, one parameter per way a value reaches a request, and a form with numbers, flags and lists |
| `dates` | generated with `dates: 'date'`: a date-time in every place a value goes (named, nullable, defaulted, listed, recursive, a query, a form, a reply); `src/emit/dates.spec.ts` runs it |

`test/generate.ts` writes each case's generated files to
`test/generated/<case>/`, with the `hono` option on, together with its
`agreement.ts`. Git ignores that folder. Nothing generated is committed as a
file. What the output looks like is pinned by the snapshots in
`src/emit/__snapshots__/`, and a change to the generator shows up there as a
reviewable diff:

```sh
bun run fixtures && bun test src --update-snapshots
```

It also writes `test/generated/perf/`:
- the files generated in memory from `test/perf.ts`'s synthetic spec of 500
  operations;
- a `routes.ts` that registers a route for each;
- `tsconfig.json`, which checks everything, and `tsconfig.base.json`, which
  leaves the routes out. The perf spec runs `tsc` on both, and budgets the
  difference per route.

It has no snapshot.

## The agreement check

For every named schema, `agreement.ts` holds:

```ts
Agree<Equal<z.output<typeof Z.zEmployee>, T.Employee>>,
Agree<Equal<z.input<typeof Z.zEmployee>, T.EmployeeInput>>,
```

For every parameter group and every form validator, it checks the output
only, because those validators take text.

`Equal` is mutual assignability, and it rejects `any` on either side. The
package's `tsconfig.json` sets `noImplicitAny`, so a generated schema cannot
pass by degrading to `any`.

## Adding a mapping

1. Add a schema, or a parameter, to `test/fixtures/kitchen-sink/openapi.yaml`.
2. `bun run fixtures && bun test src --update-snapshots`. Read the new
   snapshot as a reviewer would.
3. Assert what the validator does at runtime in `src/emit/zod.spec.ts` or
   `src/emit/operations.spec.ts`.
4. `bun run typecheck`, so the agreement file covers the new schema.
