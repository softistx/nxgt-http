# AGENTS.md

Instructions for any coding agent working in `alxia`.

## What this repository is

A type-safe HTTP framework for Bun, published as `@alxia/*`:

| package | what it is | peers |
| --- | --- | --- |
| `@alxia/core` | the framework: routes, hooks, groups, plugins, cookies, SSE, WebSockets | — |
| `@alxia/client` | the client of an app, typed from `typeof app` alone | core |
| `@alxia/openapi` | the OpenAPI 3.1 document of an app, from its route schemas | core |
| `@alxia/zod` | Zod coercions (`zq`) and the OpenAPI converter | zod |
| `@alxia/graphql` | GraphQL Yoga as a route: the app's hooks and typed context, Yoga's plugins | core, graphql-yoga, graphql |
| `@alxia/cors`, `@alxia/secure-headers`, `@alxia/compress` | function plugins: global hooks | core |
| `@alxia/rate-limit`, `@alxia/jwt`, `@alxia/logger` | app plugins: typed context, typed replies, routes | core |
| `@alxia/env` | environment variables through any Standard Schema | — |
| `@alxia/context-storage` | the request's context through `AsyncLocalStorage`, as nxgt-core reads Hono's with `hono/context-storage` | core |
| `@alxia/telemetry` | a server span per request, on `@nxgt/telemetry` | core, @nxgt/telemetry |
| `@alxia/redis` | rate-limit store, idempotency, caches and locks, on `@nxgt/redis` and `@nxgt/redis-guard` | core, @nxgt/redis, @nxgt/redis-guard, zod; rate-limit (optional) |
| `@alxia/janus` | sessions, refusals and permissions, on `@nxgt/janus` | core, @nxgt/janus |

Its skeleton is `softistx/nxgt-http`'s: the Bun workspace, the root
`build.ts`, Biome, changesets, `scripts/publish.ts` and `verify:artifacts`.
A check added there is a check to port here.

## Principles

- **No package has a dependency.** What one needs at runtime is a peer:
  `@alxia/core`, `zod`, `graphql-yoga`. Bun's and the web platform's own APIs —
  `Bun.CookieMap`, `Bun.file`, Web Crypto, `CompressionStream`, `node:zlib`
  — are not dependencies. `verify:artifacts` fails a manifest with a
  `dependencies` field that lists anything.
- **The core knows no validator.** It reads `~standard`, and nothing in
  `@alxia/core` or `@alxia/openapi` names Zod. What only Zod can do goes in
  `@alxia/zod`. Specs may use Zod, a devDependency, and `core` has a spec
  with a schema written by hand to keep it honest.
- **Modular by plugin, not by option.** A feature that can live outside the
  core does, as a package. A plugin is either an app given to `use` — it
  adds context, routes or typed replies — or a function `Plugin` that adds
  global hooks and returns the app unchanged in type. Plugins use the
  core's public API only: if one needs more, export it from the core.
- **The types are the product.** A mistake a type can catch is a compile
  error: a params schema that does not read the path, an unknown key in a
  route, an undeclared status, a body its schema refuses. Each has a
  `@ts-expect-error` in a spec; a new check gets one too, and a probe that
  the assertion really fails when wrong.
- **The client is honest.** Every status a route may answer is in its type:
  its declared replies, the replies of the hooks before it, its 400 when it
  validates, the 500 of every route. A handler cannot return a raw
  `Response`. A global hook's `Response` is outside the contract: use it
  only for what a typed client never asks.
- **Order is meaning.** A route hook applies to the routes declared after
  it, at runtime and in the types alike; a group's stay inside it. Global
  hooks apply everywhere. Keep the two in step.
- **What leaves the server is the schema's output.** A reply, an event, a
  socket message is validated and sent as its schema gives it back.

## Layering

```
core ◄── client, openapi, graphql, cors, secure-headers, compress, rate-limit, jwt, logger,
         telemetry, janus, context-storage
         redis ◄── rate-limit (optional peer: the store's contract)
zod             (peer: zod; dev: core, client, openapi for its specs)
env             (standalone)
```

A package that uses a sibling declares it by `workspace:^`, as a peer and a
devDependency, and imports it by its published name, which resolves through
`node_modules` to the sibling's `dist/`. **There are no cycles.**

## Adapters to the nxgt suite

An integration with something the nxgt suite already does — telemetry,
Redis, identities — is an adapter over the nxgt package, never a second
implementation: `@alxia/telemetry` is `@nxgt/telemetry`, `@alxia/redis` is
`@nxgt/redis` and `@nxgt/redis-guard`, `@alxia/janus` is `@nxgt/janus`. The
nxgt package is a peer. Where the suite has a Hono adapter, the alxia one
mirrors it — `@nxgt/telemetry-hono`, `@nxgt/janus-hono` — and the table
below records what is kept twice.

- **Bun 1.4.2.** `@nxgt/redis` needs Bun 1.4's `RedisClient`; the
  repository pins the version nxgt does.
- **Redis in the specs.** `@alxia/redis`'s run against `$REDIS_URL`, or a
  `redis-server` from `$PATH` they start on a free port. CI runs a Redis
  service container and sets `REDIS_URL`. A spec never skips for want of
  Redis: it fails, saying so.

| Kept twice | Why |
| --- | --- |
| The HTTP attribute names, in `telemetry/src/attributes.ts` and `@nxgt/telemetry-hono`'s | importing them would depend on Hono; a server span from either must read the same in a dashboard. Change both together |
| The Apollo Sandbox page, in `graphql/src/sandbox.ts` and `@nxgt/shared-graphql`'s `renderSandbox` | that one is Hono's `html` and writes its host and port in; this one reads the URL it was asked at. Change both together |
| `bodyOf`, the permission guard's option types, the device cookie, in `janus/src/` and `@nxgt/janus-hono` | the same refusals and cookies whichever server answers; importing them would depend on Hono. Change both together |

## The build

Every package is built by the root `build.ts`: JavaScript from `Bun.build`
with `packages: 'external'`, declarations from `tsc` against
`tsconfig.build.json`. Entry points are declared under `alxia.entrypoints`,
each with a matching key in `exports`.

- **Build before typecheck and tests**: `exports` points at `dist/`.
  `bun run build`, `typecheck` and `test` go through `scripts/workspace.ts`,
  which runs a package only after every sibling it names in any dependency
  field: `bun run --filter` started dependents beside their dependencies.
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
