# @alxia/context-storage

The request's context, anywhere it runs — a service, a repository, a logger
three calls down — without passing it: [alxia](https://www.npmjs.com/package/@alxia/core)'s
`hono/context-storage`, on `AsyncLocalStorage`, **typed by the app**. No
dependency.

```sh
bun add @alxia/context-storage
```

## Usage

```ts
import { alxia } from '@alxia/core';
import { contextStorage } from '@alxia/context-storage';
import { session } from '@alxia/janus';

const base = alxia().decorate({ db }).use(session(auth, { required: true }));

export const requestContext = contextStorage<typeof base>();

const app = base
	.use(requestContext)
	.get('/orders', async ({ reply }) => reply(200, await listOrders()));
```

```ts
// orders.ts — no context passed down
import { requestContext } from './app';

export async function listOrders() {
	const { db, user, set } = requestContext.get();   // typed: user, db
	set.headers.set('cache-control', 'private');
	return db.orders.forUser(user.id);
}
```

The context holds through every `await`, timer and promise of the
request, and never leaks into another's: twenty concurrent requests read
twenty contexts.

## Reading it

| | |
| --- | --- |
| `requestContext.get()` | the route's context, typed by the app the plugin was given: the request, `set`, `reply`, and what every hook before it added. Throws outside |
| `requestContext.tryGet()` | the same, or `undefined`: code that runs in and out of requests |
| `getContext<Ctx>()`, `tryGetContext<Ctx>()` | untyped, as `hono/context-storage`'s: `Ctx` is yours to state |
| `getRequestContext()` | the request as global hooks see it — in a 404, an `onResponse` — with the `route` it reached and its `error` |
| `runWithContext(ctx, work)` | runs `work` with a context: a job, a queue consumer, a test of a service |

Outside a request, `getContext()` throws a `ContextStorageError` coded
`OUTSIDE_REQUEST`; in a request that reached no route declared after the
plugin, `NOT_ROUTED`. Declare it before the routes whose code reads it.

## API

| export | |
| --- | --- |
| `contextStorage<App>()` | the plugin, with `get()` and `tryGet()` typed by `App` |
| `getContext`, `tryGetContext`, `getRequestContext`, `runWithContext` | the store, untyped |
| `ContextStorageError`, `ContextStorageErrorCode` | why there is no context |
