# AGENTS.md

Instructions for any coding agent working in `alya`. (`alya` is a working
name; renaming it is a search-and-replace of `alya` and `@alya`.)

## What this repository is

An HTTP framework for Bun, published as `@alya/*`:

| package | what it is |
| --- | --- |
| `@alya/server` | the framework: routes on `Bun.serve`, validated with any Standard Schema, typed from the request to the reply |
| `@alya/client` | the client of an app, typed from `typeof app` alone |
| `@alya/openapi` | the OpenAPI 3.1 document of an app, from its route schemas |

Its skeleton is `softistx/nxgt-http`'s: the Bun workspace, the root
`build.ts`, Biome, changesets, `scripts/publish.ts` and `verify:artifacts`.
A check added there is a check to port here.

## Principles

- **The types are the product.** A mistake a type can catch is a compile
  error, never a runtime surprise: a params schema that does not read the
  path's parameters, an unknown key in a route, an undeclared status, a body
  its schema refuses. Each has a `@ts-expect-error` in a spec; a new check
  gets one too, and a probe that the assertion really fails when wrong.
- **Standard Schema, Zod first.** `@alya/server` imports no validator: it
  reads `~standard`. Zod 4 is the reference — every example, every spec —
  and `@alya/openapi` passes Zod its own options, but Valibot and ArkType
  must keep working.
- **The client is honest.** Every status a route may answer is in its type:
  its declared replies, the replies of the hooks before it, its 400 when it
  validates, the 500 of every route. A handler cannot return a raw
  `Response`: it would be a status the client cannot know.
- **Order is meaning.** A hook applies to the routes declared after it, at
  runtime and in the types alike. Keep the two in step.
- **What leaves the server is the schema's output.** A reply is validated
  and sent as its schema gives it back, so an unknown key never leaks.

## Layering

```
server
  ├─ client    (types only; dev: its specs run an app)
  └─ openapi   (reads app.routes; its `docs` plugin is an app)
```

A package that uses a sibling declares it by `workspace:^`, as a peer and a
devDependency, and imports it by its published name, which resolves through
`node_modules` to the sibling's `dist/`. **There are no cycles.**

## The build

Every package is built by the root `build.ts`: JavaScript from `Bun.build`
with `packages: 'external'`, declarations from `tsc` against
`tsconfig.build.json`. Entry points are declared under `alya.entrypoints`,
each with a matching key in `exports`.

- **Build before typecheck and tests**: `exports` points at `dist/`.
- **A build that exits 0 is not evidence the artifact loads.**
  `bun run verify:artifacts` packs, installs and imports every package.

## TypeScript

`tsconfig.base.json` is strict past `strict`: `exactOptionalPropertyTypes`,
`noUncheckedIndexedAccess`, `noPropertyAccessFromIndexSignature`,
`noUnusedLocals` and the rest. An app's own tsconfig may hold any of them,
so the published declarations must compile under all of them. Only
`scripts/`, copied from nxgt-http, relaxes two.

## Releasing

Changesets, independent versions. A change under `packages/` needs one.
Merging to `develop` opens a "Version packages" PR; merging that publishes
with `bun publish`, in dependency order. Registry configuration lives in
`bunfig.toml`, never in `.npmrc`; publishing reads `$NPM_TOKEN`. Every
package is public and MIT, with its own copy of `LICENSE`.

## Conventions

- Biome, with tabs and single quotes. `./node_modules/.bin/biome check --write`
  before committing; `bunx biome ci` must pass.
- Commit messages: `<type>: <Capitalized summary>`, with `feat`, `fix`,
  `update`, `chore`, `docs`, `typo`, `ci`.
- Imports carry no extension. Specs live next to the code they test, files
  are organised in folders by role.
- A package's `README.md` is its npm page: by section, a copy-paste example
  each, and an **API** table of every export.
