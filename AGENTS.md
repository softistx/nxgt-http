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
| `@nxgt/typespec` | a TypeSpec library of nxgt's HTTP conventions, which a spec is written with before it is compiled to OpenAPI 3.1 or 3.2 and generated |

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
  │    └─ openapi-nuxt    ◄── httpyz-query (optional peer), openapi-codegen, openapi-hono (dev: its fixture app)
  └─ httpyz-query   ◄── openapi-httpyz (optional peer), openapi-codegen (dev: its fixtures)

typespec            ◄── openapi-codegen, openapi-hono (dev: compiles, generates and serves its fixtures)
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
  optional peer, for its `./hono` subpath. `@nxgt/httpyz-query`,
  `@tanstack/vue-query` and `vue` are optional peers too, for its `./query`
  subpath: the module imports it only with `query` set. `@nuxt/kit`, `@nuxt/schema` and
  `h3`, for the event's type, are its only dependencies. It does not depend on
  `@nxgt/openapi-hono`: it serves any app with a `fetch(request)`. The
  generator, openapi-hono and Nuxt are devDependencies, for `test/app`, a
  Nuxt app its specs build with `nuxi` under Node, serve and call over HTTP.
  That is why CI sets up Node 22 beside Bun. Its `typecheck` runs
  `nuxi prepare`, then checks the app's `.ts` with the app's own tsconfig.
- `@nxgt/typespec` has `@typespec/compiler`, `@typespec/http` and
  `@typespec/openapi` as peers:
  its conventions are `.tsp` files under `lib/`, reached through `tspMain` and
  the `typespec` export condition. `lib/main.tsp` imports `../dist/index.js`,
  the build of `src/`: the library's `$lib` and its decorators, which the
  compiler loads only through that import. So a fixture compiles only once the
  package is built, as CI does. The generator and `@nxgt/openapi-hono`
  are devDependencies: `test/generate.ts` compiles each fixture's `.tsp`,
  generates it, and its specs serve it. A fixture imports the package by its
  own name, `import "@nxgt/typespec"`, as an app does; TypeSpec resolves the
  self-reference through the package's `exports`. Each fixture compiles to
  OpenAPI 3.1 and 3.2 alike, `<case>/3.1.0/openapi.yaml` and
  `<case>/3.2.0/openapi.yaml`, generated and served both ways; both are
  committed, and a spec fails when it is not what the `.tsp`
  compiles to (`bun run fixtures:typespec` accepts a change), as the
  generator's own `typespec` fixture does. A decorator is exported only
  through `$decorators`, under `Nxgt`: a top-level `$name` export declares it
  a second time in the global namespace, and every use becomes
  `ambiguous-symbol`. `$lib` is in `src/lib.ts`, each feature's JS in its
  own file (`$onValidate` runs each check: operation ids, one reply per
  status), and `src/index.ts` only exports them. `@operationIds` sets its
  ids in `$onValidate`, after every decorator, so an operation's own
  `@operationId` wins whatever the order; on a template, TypeSpec runs it on
  each instance, never emitted, so the ids go to the interfaces extending
  it. A program the library must accept or refuse, without a fixture of its
  own, is a `.tsp` under `test/programs/`, compiled without emitting by its
  spec. `templates/` is the `tsp init` template, shipped in the tarball:
  `src/template.spec.ts` fills in its placeholders into the gitignored
  `test/scaffolded/` and compiles it with the linter. Never run `tsp init`
  inside the repository: it writes `package.json`, `main.tsp` and the rest
  into the current directory, over the package's own; try it from a scratch
  directory.
- `@nxgt/openapi-hono` has the generator as a devDependency, for its
  fixtures. The one `paths` entry left is its own name, so that the
  generated `hono.ts` in its fixtures runs the engine the specs import from
  `src`, not a build of it.
- `@nxgt/openapi-codegen` depends on no sibling. Its fixtures' `hono.ts` is
  excluded from its typecheck, and `@nxgt/openapi-hono` type-checks and runs
  the same files against itself. `typecheck:generated` checks them all, the
  conformance ones included, against the runtime's built declarations; `hono`
  is a devDependency of the generator for that. It does not depend on alxia
  either, though its `alxia` option writes `alxia.ts` for an alxia app: the
  fixtures' `alxia.ts`, which import `eventStream` from `@alxia/core` for a
  reply of server-sent events, are checked against `test/alxia/core.ts`, a
  stand-in of alxia's types, through a `paths` entry in the generator's
  `tsconfig.json` and in `tsconfig.generated.json`.

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
  no `LICENSE`. It fails a `files` entry the tarball holds nothing under,
  with `<package>: files lists <entry>, which the tarball does not hold — build it
  first, or drop it from files` —
  npm skips such an entry without a word. It also fails a tarball that ships
  test code — a `*.spec.*`,
  a `*.test.*`, a snapshot, or a `<subject>.fixtures.*` — with
  `<package>: the tarball ships test code: <path>`. A plain `fixtures.*`
  passes: the dotted prefix is what marks the fixtures specs share. Each
  `tsconfig.build.json` excludes only `test/` and `**/*.spec.ts`; the only
  other kind under a `src/` is openapi-codegen's `__snapshots__/*.snap`,
  which `tsc` does not emit and `files` does not list, so no tarball holds
  any today. This check is what holds that. `changeset:publish` runs it, so
  a release cannot skip it.
  `scripts/verify-artifacts.ts` only runs the stages in order and stops at
  the first that fails; each lives in `scripts/artifacts/`, one module per
  responsibility, with a spec beside each pure one: `packages.ts` reads the
  workspace, `tarball.ts` a tarball's entries, `manifest.ts` its dependency
  fields, `registry.ts` asks npm, then `stale.ts`, `install.ts`, `load.ts`
  and `classes.ts`. The split follows nxgt-janus's copy module for module,
  so a check added to one copy is a check to port to the others; the table
  under *Kept twice* says what this copy has and lacks.
  It packs `dist/` and does not build, so it refuses to start on a package
  with no `dist/` or a `src/` newer than it: `<package>: no dist/`, then
  "Run `bun run build` first". Until 2026-09-27 the missing-`dist/` case
  crashed on a raw `ENOENT` instead, because on Bun 1.4.2
  `Bun.Glob().scan` throws on a missing `cwd`; `stale.spec.ts` now holds it.
- **A type a consumer's declaration must name is exported.** The last stage
  of `verify:artifacts`, `scripts/artifacts/emit.ts`, emits the declarations
  of each package's `test/declarations/*.ts` against the install, under a
  consumer's strict settings. A function there whose inferred return type
  holds a type the entry does not export fails with TS2883 ("cannot be named
  without a reference to …"), and nowhere else: inside the workspace a
  package resolves to its own folder through a symlink, so tsc names the
  type by a relative path, even with the declaration build on. Learned in
  alxia (softistx/alxia#87), not nxgt-core. `httpyz`'s fixture covers the client, a
  group, declared replies, `unwrap`, `ok`, `cache`, `events` and `lines`; a
  builder that adds a type to what an app exports gets a case there. The
  folder is typechecked with its package and never built or shipped.
- **Build before typecheck and tests.** `exports` points at `dist/`, so on a
  clean checkout `@nxgt/httpyz` resolves to nothing for the binding. CI builds
  first.
- **CI lints with the Biome `bun.lock` resolved**: `bunx biome ci`, the
  version `bun run check` runs locally, and the one `biome.json`'s `$schema`
  names. Not `biomejs/setup-biome` with `latest`, which linted
  CI with a newer Biome than anyone ran locally. Raising Biome is a lock bump
  that moves the `$schema` with it.
- **Every job has a `timeout-minutes`**, sized from the runs measured up to
  2026-09-27: 8 for CI, whose job took 1 to 2 minutes, and 10 for the
  release, which took under a minute and a half — generous, since a publish
  killed half-way is worse than one waited on. Past it a run is hung, and the
  six-hour default holds the runner for nothing. `ci.yml` has nxgt-janus's
  `concurrency` group: a pull request's new push cancels its run in progress,
  and a push to `develop`, were CI ever to run on one, never would. The
  release keeps its own group, which never cancels a run under way.
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
| `scripts/verify-artifacts.ts` and `scripts/artifacts/`, beside nxgt-janus, nxgt-data and nxgt-core | each repository releases on its own, so the skeleton is copied, not shared. All four are split module for module and hold the same three checks: the test-code check, the guard that reports an unbuilt package as `no dist/`, and `missingFiles`, whose spec holds that a `files` entry `dis` is not covered by `dist/`. `emit.ts`, the declaration-emit check over `test/declarations/`, comes from softistx/alxia#87 and is ported to nxgt-janus, nxgt-data and nxgt-core in step with this copy. This copy lacks nxgt-core's `browser.ts`, a check for the `browser` export condition, which no package here declares. It also reads a sibling's version from the packed manifests, where nxgt-janus and nxgt-data read it from the workspace. Outside `scripts/artifacts/`, `check-changesets.ts` is nxgt-janus's alone, and `check-nxgt-versions.ts` with its weekly `nxgt versions` workflow is nxgt-janus's, copied into nxgt-data and nxgt-core by softistx/nxgt-data#139 and softistx/nxgt-core#158, but not here: it tracks `@nxgt/*` devDependencies from outside the repository, and every `@nxgt/*` package here depends only on its siblings, by `workspace:^`. A package that takes one from outside brings the check with it. A check added to one copy is a check to port to the others |
| How a request is read and refused, in `openapi-hono/src/engine.ts` and `openapi-msw/src/request/read-request.ts` | the mock answers with the server's 400, with the same issues in the same order. The engine reads through Hono's `Context`, which the mock has no use for, and the mock depending on the runtime would pull in Hono. Change both together |
| The pinned `tsp compile` and its drift check, in `openapi-codegen/test/typespec.ts` and `typespec/test/generate.ts` | neither can import the other: `@nxgt/typespec` reaching into the generator's `test/` is a relative import into a sibling, and the generator depending on `@nxgt/typespec` is a cycle. Change both together |
| alxia's `RouteOperation`, `StatusCode` and `eventStream`, in `openapi-codegen/test/alxia/core.ts`, and its router's rules, in `openapi-codegen/src/emit/alxia/routable.ts` | alxia lives in `softistx/alxia`, and the generator depends on no framework it writes for: the stand-in types the fixtures' `alxia.ts` is checked against, and the warning for a path alxia's `compilePath` would refuse. Change them when alxia's `app/route-operation.ts`, `types/status.ts`, `sse/event-stream.ts` or `router/router.ts` change |
| `openapi-codegen/test/fixtures/shared-components/` | a copy of the `openapi/components/` that nxgt-core's `@nxgt/shared-openapi` publishes: real split fragments for the loader and the `split` fixture. It is a fixture, not a dependency |

## Conventions

- Biome, with tabs and single quotes. Run `./node_modules/.bin/biome check
  --write` before committing, and `bunx biome ci` must pass, as in CI.
- Commit messages: `<type>: <Capitalized summary>`, with types `feat`, `fix`,
  `update`, `chore`, `docs`, `typo`, and `ci` for the workflows and the setup
  action.
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

`bun run test` is **575 pass, 0 fail** on 2026-10-03: datasource-rest 26, httpyz 90, httpyz-query 14,
openapi-codegen 181, openapi-hono 31, openapi-httpyz 28, openapi-msw 21, openapi-nuxt 36, typespec 120,
scripts 28. It runs one process per package, and each
package's `test` script writes the generated fixtures its specs import first;
then `bun test scripts` runs the repository scripts' own specs.
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
