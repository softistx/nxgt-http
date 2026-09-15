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
| `@nxgt/httpyz-query` | TanStack Query options for the calls of an `@nxgt/httpyz` client |
| `@nxgt/datasource-rest` | a REST service called from a GraphQL resolver through the bound client: token forwarding, a shared cache, its own `DataSourceError` |
| `@nxgt/openapi-msw` | MSW handlers for the generated operations: the request read and refused as the server does, replies typed and checked against the spec |
| `@nxgt/openapi-nuxt` | a Nuxt module: the Hono app served by Nitro under a prefix, and `useApi()`, the bound client, which calls it in process during SSR |

They were extracted from `softistx/nxgt-core` on 2026-09-13 with their
history (`git filter-repo`). Before that, the client was `@nxgt/openapi-client`
and then `@nxgt/http-client`, and the Hono runtime was the
`@nxgt/openapi-codegen/hono` subpath. Codegen 0.1.0, with that subpath, was
published from nxgt-core; everything after it comes from here.
`@nxgt/datasource-rest` followed on 2026-09-14, after its 1.0.3, with its
history: it is an integration of the generated operations, so it lives with
them.

The client is **standalone first**: everything it does works without a spec
or generated code. OpenAPI is one integration, in its own package. A feature
lands in `@nxgt/httpyz` first, and in the binding second.

## Layering

```
httpyz            openapi-codegen
  │                 └─ openapi-hono          (dev: generates its fixtures)
  ├─ openapi-httpyz ◄── openapi-codegen, openapi-hono   (dev: its fixtures)
  │    ├─ datasource-rest ◄── openapi-codegen (dev: its fixtures)
  │    ├─ openapi-msw     ◄── openapi-codegen (dev: its fixtures)
  │    └─ openapi-nuxt    ◄── openapi-codegen, openapi-hono (dev: its fixture app)
  └─ httpyz-query   ◄── openapi-httpyz (optional peer), openapi-codegen (dev: its fixtures)
```

This is a Bun workspace, as nxgt-core is: **a package that uses a sibling
declares it, by `workspace:^`**, and imports it by its published name, which
resolves through `node_modules` to the sibling's `dist/`. `bun run --filter`
builds in that dependency order. There is no tsconfig `paths` to a sibling and
no relative import into one.

- `@nxgt/openapi-httpyz` has `@nxgt/httpyz` as a peer, and as a
  devDependency to build against. The generator and the Hono runtime are
  devDependencies: its specs serve the fixture they generate.
- `@nxgt/httpyz-query` has `@nxgt/httpyz` and `@tanstack/query-core` as
  peers. It imports nothing of TanStack's at runtime, only its types, so any
  adapter takes what it returns; its specs run query-core's own `QueryClient`.
  Its `./openapi` subpath imports `@nxgt/openapi-httpyz`'s types only, an
  optional peer; the generator is a devDependency, for its fixtures.
- `@nxgt/datasource-rest` has `@nxgt/httpyz` and `@nxgt/openapi-httpyz` as
  peers, and as devDependencies to build against; the generator is a
  devDependency, for its fixtures. It depends on no exception package: its
  `DataSourceError` is its own, as each package here keeps its errors.
- `@nxgt/openapi-msw` has `@nxgt/httpyz`, `@nxgt/openapi-httpyz` and `msw`
  as peers, and as devDependencies to build against. It reads the
  `operations` table through openapi-httpyz's types and checks with httpyz's
  `check`; it does not depend on `@nxgt/openapi-hono`, which would pull in
  Hono. The generator is a devDependency, for its fixtures.
- `@nxgt/openapi-nuxt` has `@nxgt/httpyz`, `@nxgt/openapi-httpyz` and `nuxt`
  as peers: the client it writes into the app imports them. `hono` is an
  optional peer, for its `./hono` subpath. `@nuxt/kit`, `@nuxt/schema` and
  `h3`, for the event's type, are its only dependencies. It does not depend on
  `@nxgt/openapi-hono`: it serves any app with a `fetch(request)`. The
  generator, openapi-hono and Nuxt are devDependencies, for `test/app`, a
  Nuxt app its specs build with `nuxi` under Node, serve and call over HTTP.
  That is why CI sets up Node 22 beside Bun. Its `typecheck` runs
  `nuxi prepare`, then checks the app's `.ts` with the app's own tsconfig.
- `@nxgt/openapi-hono` has the generator as a devDependency, for its
  fixtures. The one `paths` entry left is its own name, so that the
  generated `hono.ts` in its fixtures runs the engine the specs import from
  `src`, not a build of it.
- `@nxgt/openapi-codegen` depends on no sibling. Its fixtures' `hono.ts` is
  excluded from its typecheck, and `@nxgt/openapi-hono` type-checks and runs
  the same files against itself. `typecheck:generated` checks them all, the
  conformance ones included, against the runtime's built declarations; `hono`
  is a devDependency of the generator for that.

**There are no cycles and there must not be one**, devDependencies included.
A published package cannot depend on a package that depends back on it: the
version bump has no fixed point, and changesets cannot order the release. A
test that needs the other end, as the generator's `dates` routes did, moves to
the package that sits above.

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
  registry, an exact pin on a sibling, or a package that is not MIT or ships
  no `LICENSE`. `changeset:publish` runs it, so a release cannot skip it.
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
- **Every package is MIT**, `"license": "MIT"`, with `LICENSE` in its `files`
  and a copy of the root `LICENSE` in its directory. A new package copies it.

## Deliberate duplication: do not "clean this up"

| Kept twice | Why |
| --- | --- |
| `unroutable`, in `openapi-hono/src/routable.ts` and `openapi-codegen/src/emit/routable.ts` | the runtime refuses the route and the generator warns. Importing one from the other would make the runtime a dependency of the generator. Change both together |
| `LICENSE`, at the root and in each `packages/*/` | npm ships only the `LICENSE` in the package's own directory. `verify:artifacts` fails a tarball without one. Change them all together |
| How a request is read and refused, in `openapi-hono/src/engine.ts` and `openapi-msw/src/request/read-request.ts` | the mock answers with the server's 400, with the same issues in the same order. The engine reads through Hono's `Context`, which the mock has no use for, and the mock depending on the runtime would pull in Hono. Change both together |
| `openapi-codegen/test/fixtures/shared-components/` | a copy of the `openapi/components/` that nxgt-core's `@nxgt/shared-openapi` publishes: real split fragments for the loader and the `split` fixture. It is a fixture, not a dependency |

## Conventions

- Biome, with tabs and single quotes. Run `./node_modules/.bin/biome check
  --write` before committing, and `biome ci` must pass.
- Commit messages: `<type>: <Capitalized summary>`, with types `feat`, `fix`,
  `update`, `chore`, `docs` and `typo`.
- A repository script is a TypeScript file run by Bun, with Bun Shell, not a
  `.sh`.
- **Imports carry no extension**: `import { operations } from
  '../generated/operations'`, not `'…/operations.js'`. Every tsconfig here
  resolves as a bundler does, and Bun runs the specs the same way. The
  generated code follows it too: `importExtension` defaults to `''`, and an
  app under `nodenext` sets `'.js'`. The READMEs' examples carry none.
- **A package's `README.md` is its page on npmjs.** It is read by someone who
  has never seen this repository: organize it by section, with a copy-paste
  example each, and never name a private application.
- Specs live next to the code they test (`*.spec.ts`), and files are
  organised in folders by role (`client/`, `request/`, `reply/`,
  `middleware/`…), not flat.

## Known state

`bun run test` is **392 pass, 0 fail**: datasource-rest 26, httpyz 90, httpyz-query 14,
openapi-codegen 160, openapi-hono 28, openapi-httpyz 28, openapi-msw 21, openapi-nuxt 25. It runs one process per package, and each
package's `test` script writes the generated fixtures its specs import first.
Treat any failure as yours.

**The generated code compiles under the strictest settings.** It lands in an
app's own source, so the app's `tsconfig` checks it, whatever that holds:
`noUnusedLocals`, `exactOptionalPropertyTypes`,
`noPropertyAccessFromIndexSignature` and the rest. `bun run typecheck` ends
with `typecheck:generated`, which checks every fixture of every package
against `tsconfig.generated.json`, with those options on, and against the
built packages, as an app sees them. The specs call that same generated code,
never a hand-written copy of it. A fixture that fails here is a generator
bug, not a fixture to exclude.
