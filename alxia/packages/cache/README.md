# @alxia/cache

HTTP response caching for [alxia](https://www.npmjs.com/package/@alxia/core),
with no dependency: fresh responses served again, stale ones served while
they refresh, one route run for many concurrent misses, tags to empty it,
ETags and 304s. In memory, or in Redis with
[`@alxia/redis`](https://www.npmjs.com/package/@alxia/redis)'s
`redisCacheStore`.

```sh
bun add @alxia/cache
```

## Usage

```ts
import { cache } from '@alxia/cache';

const products = cache({ ttl: 60, staleWhileRevalidate: 300, tags: () => ['products'] });

const app = alxia()
	.post('/products', async ({ body, reply }) => {
		await save(body);
		await products.invalidateTag('products');           // the next GET runs the route
		return reply(201, …);
	})
	.use(products)                                         // the GETs after it are cached
	.get('/products', ({ reply }) => reply(200, list()))
	.get('/products/:id', ({ params, cache, reply }) => {
		cache.tag(`product:${params.id}`);                // a tag of its own
		return reply(200, find(params.id));
	});
```

## What it does

- **Fresh** (`ttl` seconds): answered from the store, `X-Cache: HIT`.
- **Stale** (`staleWhileRevalidate` seconds more): answered from the store at
  once, `X-Cache: STALE`, while one request refreshes it behind.
- **Missing**: the route runs once, however many requests wait for it, and
  its response is kept: `X-Cache: MISS`.
- **A weak `ETag`** from the body when the route set none: a client whose
  copy is current gets a 304.
- **Never kept**: a status outside `statuses` (`200`), a response that says
  `Cache-Control: private` or `no-store`, sets a cookie, or streams events —
  and one whose route called `cache.skip()`.
- Only `GET` and `HEAD`; only the routes declared after the plugin.

## The key

The path and the query, by default. A response that differs by a header —
the language — lists it in `vary`, which keys by its value and says `Vary`:

```ts
cache({ ttl: 60, vary: ['accept-language', 'cookie'] });
cache({ ttl: 60, key: (ctx) => (ctx.request.headers.has('authorization') ? undefined : ctx.url.pathname) });
```

`key` returning `undefined` is not cached: a request with a session, say.

## Two stores

```ts
import { MemoryCacheStore } from '@alxia/cache';
import { redisCacheStore } from '@alxia/redis';

cache({ ttl: 60, store: new MemoryCacheStore({ maxEntries: 5_000, maxBytes: 128 * 1024 * 1024 }) });
cache({ ttl: 60, store: redisCacheStore(connection.client, { name: 'shop' }) });
```

The memory store keeps the most recently read responses of one process. The
Redis store, on `@nxgt/redis`, shares them — and their invalidation —
across every process. A store of your own implements `CacheStore`: `get`,
`set`, `delete`, `deleteTag`.

## Options

| option | default | |
| --- | --- | --- |
| `ttl` | required | seconds fresh |
| `staleWhileRevalidate` | 0 | seconds served stale while refreshed |
| `store` | `MemoryCacheStore` | |
| `key` | path and query | `(ctx) => string \| undefined` |
| `vary` | none | request headers the response depends on |
| `statuses` | `[200]` | |
| `tags` | none | `(ctx) => string[]` |
| `honorClientNoCache` | `false` | a client's `no-cache` skips the cache |
| `debugHeaders` | `true` | `X-Cache` and `Age` |

## API

| export | |
| --- | --- |
| `cache(options)` | the plugin, with `invalidate(path)`, `invalidateTag(tag)` and `store`; routes after it read `cache.tag()` and `cache.skip()` |
| `MemoryCacheStore` | the in-process store |
| `CacheStore`, `CachedResponse` | a store's contract |
