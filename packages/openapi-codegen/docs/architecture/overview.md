# Architecture overview

```mermaid
flowchart LR
	spec[(spec files)] --> load[loader<br/>loadDocument]
	load --> ir[ir<br/>buildIR]
	ir --> emit[emit<br/>emitFiles]
	emit --> write[writer<br/>writeFiles]
	write --> out[(types.gen.ts<br/>zod.gen.ts<br/>operations.gen.ts<br/>paths.gen.ts)]
```

`generate()` (`src/generate.ts`) runs the four stages. `generateFiles()` stops
before the writer.

| Stage | Directory | In | Out |
| --- | --- | --- | --- |
| [Loader](loader.md) | `src/loader/` | a path | `LoadedDocument`: every reachable file parsed, every `$ref` checked |
| [IR](ir.md) | `src/ir/` | `LoadedDocument` | `ApiIR`: named schemas in emit order, operations, warnings |
| [Emitters](emitters.md) | `src/emit/` | `ApiIR` | `GeneratedFile[]` |
| Writer | `src/writer/` | files | written, unchanged and drifted paths |

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
   the files. In between, everything is synchronous: after `Resolver.crawl`,
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
   consumer's runtime never depends on this package for the schema code.

## Where to start reading

- `src/generate.ts`: the whole pipeline, options included, in under a
  hundred lines.
- `src/ir/types.ts`: the IR, the contract between the stages.
- `test/fixtures/kitchen-sink/openapi.yaml`, and the snapshot of what it
  generates in `src/emit/__snapshots__/`: every mapping, side by side.
