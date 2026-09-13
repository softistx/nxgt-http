# Loader

`loadDocument(path, { cwd?, fs? })` (`src/loader/document.ts`) reads the root
document, follows every `$ref` it can reach, and checks the version. It is
the only stage that touches the disk, through the `FileSystem` interface in
`src/loader/fs.ts`. Tests pass an in-memory one.

## Parsing (`parse.ts`)

A `.json` file is parsed with `JSON.parse`, and any other file with
`Bun.YAML`. A file whose
top is not an object is `invalid_root`. A YAML file with several documents is
refused. `Bun.YAML` gives no line numbers, so every diagnostic is located by
`file#pointer`.

## Resolving (`resolver.ts`)

`Resolver.crawl(root)` walks every parsed value and collects each `$ref`.
Then it loads the files they name, then those files' references, until
nothing new is reached. This is all the waiting the pipeline does. After it,
`get`, `target` and `deref` are synchronous lookups.

- **A reference is `file#pointer`.** The file is relative to the file that
  holds the `$ref`, and both parts are percent-decoded. `#anchor` fragments
  are `invalid_ref`. Anything with a URI scheme (`https:`, `urn:`…) is
  `remote_ref`.
- **Files are keyed by their real path**, so a fragment reached through a
  symlink in `node_modules` and through its own path is one file, and one
  schema.
- **Redirects collapse.** A file whose whole content is a `$ref` (Redocly's
  one-line re-export) is followed to the end, so every route to a shared
  fragment ends at the same place. A chain that comes back to itself is
  `ref_cycle`. A schema that contains a reference to itself is not a cycle;
  the IR handles it.
- **Not everything under a `$ref` key is one.**
  - Inside `example`, `default`, `const`, `enum` and the examples' `value`
    keys, a `$ref` is data, and it is not followed.
  - One level under a key that maps names to objects (`properties`,
    `schemas`, `paths`, `responses`…), a key is a name. A property called
    `default` or `example` is a schema there, not a keyword to skip.
- **A Reference Object may override** `summary` and `description` beside its
  `$ref`. A schema `$ref` with other siblings is left for the IR, which reads
  it as `allOf`.

Every problem is collected. `crawl` reports all the missing files and bad
pointers of a spec in one `CodegenError`.

## Version (`document.ts`)

The root must carry `openapi: 3.1.x` or `3.2.x`. With no `openapi` field it is
`missing_version`. `swagger: 2.0` and `3.0.x` are `unsupported_version`, with
the advice to convert. The resulting `LoadedDocument` records `version:
'3.1' | '3.2'`, which later decides whether the `query` method is allowed.
