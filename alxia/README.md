# alxia

A type-safe HTTP framework for Bun. Modular to the bone: the core has **no
dependency**, and everything else — Zod, OpenAPI, CORS, JWT, compression —
is a package you add, or don't.

| Package | |
| --- | --- |
| [`@alxia/core`](packages/core) | routes on `Bun.serve`, validated with any Standard Schema; replies typed by status; hooks, groups and plugins; cookies, server-sent events and WebSockets, typed |
| [`@alxia/client`](packages/client) | the typed client of an app, from `typeof app`: no spec, no codegen. Results are a union by status; events and sockets typed too |
| [`@alxia/zod`](packages/zod) | Zod 4: coercions a client can type (`zq.int()`, `zq.array()`…), and the OpenAPI converter |
| [`@alxia/graphql`](packages/graphql) | GraphQL with Yoga and its plugins: behind the app's hooks, resolvers reading its typed context, subscriptions over SSE |
| [`@alxia/openapi`](packages/openapi) | the OpenAPI 3.1 document of an app, from its schemas, and a reference page |
| [`@alxia/cors`](packages/cors) | CORS: preflights before routing, headers on every response |
| [`@alxia/secure-headers`](packages/secure-headers) | HSTS, CSP, nosniff and the rest |
| [`@alxia/rate-limit`](packages/rate-limit) | a rate limit whose 429 is in the client's types; pluggable stores |
| [`@alxia/compress`](packages/compress) | zstd, Brotli, gzip, deflate: negotiated and streamed |
| [`@alxia/static`](packages/static) | static files: ETags, 304s, a single-page fallback, no traversal |
| [`@alxia/jwt`](packages/jwt) | JWTs on Web Crypto, and a typed bearer guard |
| [`@alxia/logger`](packages/logger) | a request id, structured logs, `Server-Timing` |
| [`@alxia/env`](packages/env) | environment variables, validated and typed at startup |

Not one package declares a dependency: what one needs at runtime — `zod`,
`graphql-yoga`, `@alxia/core` — is a peer, the app's own copy.

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

Bun 1.3.14 or later.

```sh
bun install
bun run build        # first, in dependency order: packages resolve each other through dist/
bun run typecheck
bun run test
bun run verify:artifacts
./node_modules/.bin/biome check --write
```

The repository skeleton — the workspace, `build.ts`, Biome, changesets, the
release workflow and `verify:artifacts` — comes from
[softistx/nxgt-http](https://github.com/softistx/nxgt-http).
