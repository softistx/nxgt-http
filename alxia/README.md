# alxia

A type-safe HTTP framework for Bun. Modular to the bone: the core has **no
dependency**, and everything else — Zod, OpenAPI, CORS, JWT, compression —
is a package you add, or don't.

| Package | |
| --- | --- |
| [`@alxia/core`](packages/core) | routes on `Bun.serve`, validated with any Standard Schema; replies typed by status; hooks, groups and plugins; cookies, server-sent events and WebSockets, typed; static files and Bun's HTML bundles |
| [`@alxia/client`](packages/client) | the typed client of an app, from `typeof app`: no spec, no codegen. Results are a union by status; events and sockets typed too |
| [`@alxia/zod`](packages/zod) | Zod 4: coercions a client can type (`zq.int()`, `zq.array()`…), and the OpenAPI converter |
| [`@alxia/graphql`](packages/graphql) | GraphQL with Yoga and its plugins: behind the app's hooks, resolvers reading its typed context, subscriptions over SSE, GraphiQL or Apollo Sandbox |
| [`@alxia/openapi`](packages/openapi) | the OpenAPI 3.1 document of an app, from its schemas, and a reference page |
| [`@alxia/cors`](packages/cors) | CORS: preflights before routing, headers on every response |
| [`@alxia/secure-headers`](packages/secure-headers) | HSTS, CSP, nosniff and the rest |
| [`@alxia/rate-limit`](packages/rate-limit) | a rate limit whose 429 is in the client's types; pluggable stores |
| [`@alxia/cache`](packages/cache) | HTTP response caching: TTL, stale-while-revalidate, one load per miss, tags, ETags; in memory or Redis |
| [`@alxia/language`](packages/language) | the request's language, typed: query, cookie, path, `Accept-Language` |
| [`@alxia/compress`](packages/compress) | zstd, Brotli, gzip, deflate: negotiated and streamed |
| [`@alxia/jwt`](packages/jwt) | JWTs on Web Crypto, and a typed bearer guard |
| [`@alxia/logger`](packages/logger) | a request id, structured logs, `Server-Timing` |
| [`@alxia/env`](packages/env) | environment variables, validated and typed at startup |
| [`@alxia/context-storage`](packages/context-storage) | the request's context anywhere it runs, typed by the app: `hono/context-storage` for alxia |

Adapters to the [nxgt](https://github.com/softistx) suite:

| Package | |
| --- | --- |
| [`@alxia/telemetry`](packages/telemetry) | traces and logs on `@nxgt/telemetry`: a server span per request, named for its route |
| [`@alxia/redis`](packages/redis) | on `@nxgt/redis` and `@nxgt/redis-guard`: shared rate-limit and response-cache stores, idempotent routes, typed caches and locks |
| [`@alxia/i18n`](packages/i18n) | translations on `@nxgt/i18n`: `t()` in the request's language, typed keys, ICU |
| [`@alxia/janus`](packages/janus) | identities, sessions and permissions on `@nxgt/janus`: the user typed, the cookie renewed, refusals typed |

Not one package declares a dependency: what one needs at runtime — `zod`,
`graphql-yoga`, `@nxgt/*`, `@alxia/core` — is a peer, the app's own copy.

```ts
// server.ts
import { alxia } from '@alxia/core';
import { cors } from '@alxia/cors';
import { logger } from '@alxia/logger';
import { zq } from '@alxia/zod';
import { z } from 'zod';

const app = alxia()
	.use(logger())
	.use(cors())
	.get(
		'/users/:id',
		{
			params: z.object({ id: zq.int() }),
			response: { 200: z.object({ id: z.number(), name: z.string() }), 404: z.object({ error: z.literal('not_found') }) },
		},
		({ params, reply }) => (params.id === 1 ? reply(200, { id: 1, name: 'Ada' }) : reply(404, { error: 'not_found' })),
	);

app.listen(3000);
export type App = typeof app;

// anywhere else
import { client } from '@alxia/client';
import type { App } from './server';

const result = await client<App>('http://localhost:3000').get('/users/:id', { params: { id: 1 } });
if (result.status === 200) result.data.name; // string
```

## Development

Bun 1.4.2 or later.

```sh
bun install
bun run build        # first, in dependency order: packages resolve each other through dist/
bun run typecheck
bun run test         # @alxia/redis needs REDIS_URL, or redis-server on PATH
bun run verify:artifacts
./node_modules/.bin/biome check --write
```

The repository skeleton — the workspace, `build.ts`, Biome, changesets, the
release workflow and `verify:artifacts` — comes from
[softistx/nxgt-http](https://github.com/softistx/nxgt-http).
