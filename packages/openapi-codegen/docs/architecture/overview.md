# Architecture overview

```mermaid
flowchart LR
	spec[(spec files)] --> load[loader<br/>loadDocument]
	load -. lint .-> lint[lint<br/>lintSpec]
	lint -.-> ir
	load --> ir[ir<br/>buildIR]
	ir --> emit[emit<br/>emitFiles]
	emit --> write[writer<br/>writeFiles]
	write --> out[(types.ts<br/>zod.ts<br/>operations.ts<br/>paths.ts<br/>hono.ts, with hono)]
	out -. hono.ts .-> runtime[hono runtime<br/>createApi]
```

`generate()` (`src/generate.ts`) runs the four stages, and with the `lint`
option runs Redocly's linter between the loader and the IR. `generateFiles()`
stops before the writer. The Hono runtime is not a stage: it is
`@nxgt/openapi-hono`, the package `hono.ts` imports, run by the consumer's
app.

| Stage | Directory | In | Out |
| --- | --- | --- | --- |
| [Loader](loader.md) | `src/loader/` | a path | `LoadedDocument`: every reachable file parsed, every `$ref` checked |
| Lint, with `lint` | `src/lint.ts` | the root document's path | Redocly's problems as `lint_error` and `lint_warning`; it resolves and renames nothing |
| [IR](ir.md) | `src/ir/` | `LoadedDocument` | `ApiIR`: named schemas in emit order, operations, warnings |
| [Emitters](emitters.md) | `src/emit/` | `ApiIR` | `GeneratedFile[]` |
| Writer | `src/writer/` | files | written, unchanged and drifted paths |
| Command line | `src/cli.ts`, `src/cli/run.ts`, `src/config.ts` | arguments, a config file | `generate()` per config, an exit code |
| [Hono runtime](https://github.com/softistx/nxgt-http/blob/develop/packages/openapi-hono/docs/architecture.md) | `@nxgt/openapi-hono` | the operations table, a Hono app | routes that validate, then call the handler |

`src/errors.ts` holds the diagnostic model that every stage shares.

## Rules every stage keeps

1. **Faithful, refused, or warned. Never approximated silently.** A construct
   is generated exactly, refused with an error at its `file#pointer`, or
   accepted with a warning that names what is not enforced. A validator that
   is quietly looser than the spec is the one outcome that is never allowed.
2. **Every error of a stage at once.** Each stage collects into a
   `Diagnostics` and throws a single `CodegenError` at its end. Nothing
   throws on the first problem. A later stage does not run when an earlier
   one failed, because it would report the same causes twice.
3. **I/O at the edges only.** The loader reads the spec and the writer writes
   the files; `lint` reads the spec a second time, through Redocly, before
   the IR is built. In between, everything is synchronous: after `Resolver.crawl`,
   `get`, `target` and `deref` are lookups, and the IR and the emitters are
   pure functions of their input.
4. **One IR, two printers.** A TypeScript type and its Zod validator are
   printed from the same `SchemaNode`. They agree by construction, and the
   tests check it with `tsc` for every fixture schema (see
   [Testing](testing.md)).
5. **Same spec, same bytes.** Schemas come out in dependency order, ties in
   spec order; operations in spec order. No timestamps, no absolute paths.
   The `check` option and the snapshots depend on it.
6. **Generated code imports `zod` and its sibling files, nothing else.** A
   consumer's runtime never depends on this package for the schema code. The
   one exception is `hono.ts`, written only with the `hono` option: it
   imports `hono` and `@nxgt/openapi-hono`.

## Where to start reading

- `src/generate.ts`: the whole pipeline, options included, in about a
  hundred lines.
- `src/ir/types.ts`: the IR, the contract between the stages.
- `test/fixtures/kitchen-sink/openapi.yaml`, and the snapshot of what it
  generates in `src/emit/__snapshots__/`: every mapping, side by side.
