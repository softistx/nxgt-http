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
| code snapshots | `src/emit/golden.spec.ts` | every generated file of every fixture |
| runtime | `src/emit/zod.spec.ts`, `operations.spec.ts` | the generated validators, run on real values |
| type agreement | `test/generated/<case>/agreement.ts` | `tsc` fails if a type and its validator disagree |
| client typing | `test/types/client.ts` | a typed `request()` can be built from `Operations` alone |
| openapi-fetch typing | `test/types/paths.ts` | `createClient<paths>()` types requests and replies from `paths.gen.ts` alone |
| command line | `src/cli/run.spec.ts` | flags, config files, `--check` and exit codes through `run()`, and `src/cli.ts` as a process |

## Fixtures

`test/fixtures/<case>/openapi.yaml`:

| Case | Exercises |
| --- | --- |
| `split` | a Redocly-style spec across files, with `$ref`s into `@nxgt/shared-openapi`'s fragments, a recursive `Employee`, and `allOf` |
| `query` | OpenAPI 3.2's `query` method, with an inline body and defaults |
| `kitchen-sink` | one schema per mapping row, and one parameter per way a value reaches a request |

`test/generate.ts` writes each case's generated files, and its
`agreement.ts`, to `test/generated/<case>/`. Git ignores that folder. Nothing
generated is committed as a file. What the output looks like is pinned by
the snapshots in `src/emit/__snapshots__/`, and a change to the generator
shows up there as a reviewable diff:

```sh
bun run fixtures && bun test src --update-snapshots
```

## The agreement check

For every named schema, `agreement.ts` holds:

```ts
Agree<Equal<z.output<typeof Z.zEmployee>, T.Employee>>,
Agree<Equal<z.input<typeof Z.zEmployee>, T.EmployeeInput>>,
```

For every parameter group, it checks the output only, because a parameter
validator takes strings.

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
