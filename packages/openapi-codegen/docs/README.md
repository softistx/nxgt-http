# @nxgt/openapi-codegen documentation

The [package README](../README.md) is the short version. This folder is the
long one: a **guide** for generating and using the code, and the
**architecture** for working on the generator itself.

## Guide: using the package

| Page | Read it when |
| --- | --- |
| [Getting started](guide/getting-started.md) | generating code from a spec for the first time |
| [Command line](guide/cli.md) | running `nxgt-openapi` from a config file, a script or CI |
| [The generated code](guide/generated-code.md) | using `types.gen.ts`, `zod.gen.ts`, `operations.gen.ts` and `paths.gen.ts` |
| [Options](guide/options.md) | changing what is generated, or renaming a schema |
| [How schemas map](guide/schema-mapping.md) | wondering what a keyword becomes, or why it was refused |
| [Diagnostics](guide/diagnostics.md) | the generator reported an error or a warning |

## Architecture: working on the package

| Page | Covers |
| --- | --- |
| [Overview](architecture/overview.md) | the pipeline, where each stage lives, the rules every stage keeps |
| [Loader](architecture/loader.md) | reading a spec split across files, resolving `$ref` |
| [Intermediate representation](architecture/ir.md) | what the spec means, reduced to one shape per construct |
| [Emitters](architecture/emitters.md) | printing TypeScript and Zod from the IR, and why it prints what it does |
| [Testing](architecture/testing.md) | fixtures, snapshots, and the check that types and validators agree |
