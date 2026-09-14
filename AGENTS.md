# AGENTS.md

Instructions for any coding agent working in `nxgt-http`.

## What this repository is

The `@nxgt/*` packages for HTTP APIs, published to the public npm registry:

| package | what it is |
| --- | --- |
| `@nxgt/httpyz` | a typed HTTP client over the standard `fetch`, standalone: typed paths, replies checked with any Standard Schema, middleware, auth, retries |
| `@nxgt/openapi-codegen` | the generator: an OpenAPI 3.1/3.2 spec in, TypeScript types and Zod 4 schemas out, from one intermediate representation |
| `@nxgt/openapi-hono` | the runtime the generated `hono.ts` binds to its spec: typed Hono routes that validate, then call the handler |
| `@nxgt/openapi-httpyz` | the binding of the generated operations onto `@nxgt/httpyz` |

They were extracted from `softistx/nxgt-core` on 2026-09-13 with their
history (`git filter-repo`). Before that, the client was `@nxgt/openapi-client`
and then `@nxgt/http-client`, and the Hono runtime was the
`@nxgt/openapi-codegen/hono` subpath. Codegen 0.1.0, with that subpath, was
published from nxgt-core; everything after it comes from here.

The client is **standalone first**: everything it does works without a spec
or generated code. OpenAPI is one integration, in its own package. A feature
lands in `@nxgt/httpyz` first, and in the binding second.

## Layering

```
httpyz                  openapi-codegen
  └─ openapi-httpyz     openapi-hono
```

`@nxgt/openapi-httpyz` has `@nxgt/httpyz` as a peer and imports it as an app
does. Nothing else depends on a sibling at runtime. The generator and the Hono
runtime meet only in generated code: `hono.ts` imports `@nxgt/openapi-hono`.

**There are no cycles and there must not be one.** A published package cannot
depend on a package that depends back on it: the version bump has no fixed
point, and changesets cannot order the release.

### Siblings reach each other in tests through `paths`, not dependencies

The tests need more than the layering allows. `@nxgt/openapi-hono` serves
fixtures that `@nxgt/openapi-codegen` generates, and the generator
type-checks its own generated `hono.ts`, which imports the runtime. As
dependencies, that would be a cycle.

So a test-time sibling is a tsconfig `paths` entry pointing at its `src/`,
which both `tsc` and Bun honour. Such a tsconfig sets `"rootDir": ".."`, since
the program reaches into the sibling; `tsconfig.build.json` still roots at
`src`, which never imports a mapped sibling. `@nxgt/openapi-hono` also
declares the generator as a devDependency, which is one way and orders the
build.

Never map a real runtime dependency. `@nxgt/openapi-httpyz` imports
`@nxgt/httpyz` from `node_modules`, that is, from its `dist/`: mapped to
source, the declaration build would pull the sibling's source under its
`rootDir` and fail.

## The build

Every package is built by the root `build.ts`, as `bun run ../../build.ts`:

- **JavaScript**, from `Bun.build` with `packages: 'external'`. A library must
  never bundle its dependencies: `@nxgt/openapi-httpyz` bundling a copy of
  `@nxgt/httpyz` would give an app two `ValidationError` classes.
- **Declarations**, from `tsc --emitDeclarationOnly` against
  `tsconfig.build.json`, which excludes `*.spec.ts`.

Entry points are declared under `nxgt.entrypoints`, and each one needs a
matching key in `exports`.

Rules carried over from nxgt-core, each learned from a shipped defect:

- **`export * from '<external package>'` only in an entry point.** Below one,
  Bun emits a re-export of an undeclared variable, and the built file throws
  at import while `bun run build` exits 0.
- **A build that exits 0 is not evidence the artifact loads.**
  `bun run verify:artifacts` packs every package, installs the tarballs as a
  consumer does, imports every subpath in `exports`, runs every bin with
  `--help`, and rejects a manifest that would break an install. That means a
  `link:` or `file:` in a field a consumer resolves, a **required** peer on no
  registry, or an exact pin on a sibling. `changeset:publish` runs it, so a
  release cannot skip it.
- **Build before typecheck and tests.** `exports` points at `dist/`, so on a
  clean checkout `@nxgt/httpyz` resolves to nothing for the binding. CI builds
  first.
- **An asset ships only if it is outside `dist`.** The codegen docs are in
  `files` for that reason.

## Releasing

Changesets, with independent versions. `bun changeset` describes a change.
Merging to `develop` opens a "Version packages" PR, and merging that PR
publishes to npm.

- **A change under `packages/` needs a changeset.** CI runs
  `changeset:status`, except on `changeset-release/develop`.
- **`bun publish`, not `changeset publish`.** `scripts/publish.ts` publishes in
  dependency order and skips versions already on the registry. It writes the
  `git-tag` events `changesets/action@v2` reads from `$CHANGESETS_OUTPUT`.
- **Registry configuration lives in `bunfig.toml`, never in `.npmrc`.**
  Installing needs no token. Publishing reads `$NPM_TOKEN`, which must be a
  **granular** access token covering the `@nxgt` scope, not selected
  packages. The `NPM_TOKEN` secret holds it for CI. The only test of whether a
  token can publish is a publish.
- **The release PR needs the repository's switch.** Settings → Actions →
  General → Workflow permissions: *Read and write*, plus *Allow GitHub Actions
  to create and approve pull requests*. The organisation's switch does not
  propagate to the repository. To check it:
  `gh api /repos/softistx/nxgt-http/actions/permissions/workflow`.
- **Siblings are depended on by `workspace:^`, never `workspace:*`.** The star
  publishes an exact pin, and the consumer ends up with two copies.
- **`typescript` is a peer, `^6.0.3`, in every package.** It matches
  nxgt-core; do not raise it in one package alone.
- **Every package is public**, like the repository. Never `private: true`,
  not even for a package that is not ready: `changeset:status` and
  `verify:artifacts` already keep a half-finished package from shipping.

## Deliberate duplication: do not "clean this up"

| Kept twice | Why |
| --- | --- |
| `unroutable`, in `openapi-hono/src/routable.ts` and `openapi-codegen/src/emit/routable.ts` | the runtime refuses the route and the generator warns. Importing one from the other would make the runtime a dependency of the generator. Change both together |
| `openapi-codegen/test/fixtures/shared-components/` | a copy of the `openapi/components/` that nxgt-core's `@nxgt/shared-openapi` publishes: real split fragments for the loader and the `split` fixture. It is a fixture, not a dependency |

## Conventions

- Biome, with tabs and single quotes. Run `./node_modules/.bin/biome check
  --write` before committing, and `biome ci` must pass.
- Commit messages: `<type>: <Capitalized summary>`, with types `feat`, `fix`,
  `update`, `chore`, `docs` and `typo`.
- A repository script is a TypeScript file run by Bun, with Bun Shell, not a
  `.sh`.
- **A package's `README.md` is its page on npmjs.** It is read by someone who
  has never seen this repository: organize it by section, with a copy-paste
  example each, and never name a private application.
- Specs live next to the code they test (`*.spec.ts`), and files are
  organised in folders by role (`client/`, `request/`, `reply/`,
  `middleware/`…), not flat.

## Known state

`bun run test` is **210 pass, 0 fail**: httpyz 26, openapi-codegen 151,
openapi-hono 17, openapi-httpyz 16. It runs one process per package, and each
package's `test` script writes the generated fixtures its specs import first.
Treat any failure as yours.
