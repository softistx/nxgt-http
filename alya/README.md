# alya

> Nom de travail. Un rechercher-remplacer de `alya` / `@alya` suffit à le changer.

An HTTP framework for Bun, type-safe end to end, Zod first.

| Package | |
| --- | --- |
| [`@alya/server`](packages/server) | routes on `Bun.serve`, each validated with any Standard Schema: typed params, query, headers, body, and replies by status. Hooks and plugins whose types follow the chain |
| [`@alya/client`](packages/client) | the typed client of an app, inferred from `typeof app`: no spec, no codegen. Results are a union by status |
| [`@alya/openapi`](packages/openapi) | the OpenAPI 3.1 document of an app, from the schemas its routes declare, and a reference page |

```ts
// server.ts
import { alya } from '@alya/server';
import { z } from 'zod';

const app = alya().get(
	'/users/:id',
	{
		params: z.object({ id: z.coerce.number() }),
		response: { 200: z.object({ id: z.number(), name: z.string() }), 404: z.object({ error: z.literal('not_found') }) },
	},
	({ params, reply }) => (params.id === 1 ? reply(200, { id: 1, name: 'Ada' }) : reply(404, { error: 'not_found' })),
);

app.listen(3000);
export type App = typeof app;

// anywhere else
import { client } from '@alya/client';
import type { App } from './server';

const result = await client<App>('http://localhost:3000').get('/users/:id', { params: { id: 1 } });
if (result.status === 200) result.data.name; // string
```

## Development

Bun 1.3.14 or later.

```sh
bun install
bun run build        # first: packages resolve each other through dist/
bun run typecheck
bun run test
bun run verify:artifacts
./node_modules/.bin/biome check --write
```

The repository skeleton — the workspace, `build.ts`, Biome, changesets, the
release workflow and `verify:artifacts` — comes from
[softistx/nxgt-http](https://github.com/softistx/nxgt-http).
