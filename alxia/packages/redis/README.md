# @alxia/redis

Redis for [alxia](https://www.npmjs.com/package/@alxia/core), on
[`@nxgt/redis`](https://www.npmjs.com/package/@nxgt/redis) and
[`@nxgt/redis-guard`](https://www.npmjs.com/package/@nxgt/redis-guard) —
Bun's own Redis client, no driver, no dependency:

- `redisStore`: a rate-limit store every process shares;
- `idempotency`: routes that run once per `Idempotency-Key`;
- `redisCacheStore`: an `@alxia/cache` store every process shares;
- `redis`: the client, typed caches and a lock in the context.

```sh
bun add @alxia/redis @nxgt/redis @nxgt/redis-guard zod
```

They are peers, with `@alxia/rate-limit` for `redisStore` and `@alxia/cache`
for `redisCacheStore`. **Bun 1.4 or
later**: Bun's `RedisClient` is what the nxgt packages run on.

## A shared rate limit

```ts
import { connectRedis } from '@nxgt/redis';
import { rateLimit } from '@alxia/rate-limit';
import { redisStore } from '@alxia/redis';

const connection = await connectRedis(Bun.env.REDIS_URL!);

app.use(rateLimit({ limit: 100, windowMs: 60_000, store: redisStore(connection.client, { name: 'api' }) }));
```

GCRA, in one atomic script, timed by the Redis server's clock: every
process behind the load balancer counts together, and a refused request
counts nothing. The 429 stays typed, as `@alxia/rate-limit` types it.

## A shared response cache

```ts
import { cache } from '@alxia/cache';
import { redisCacheStore } from '@alxia/redis';

const products = cache({ ttl: 60, store: redisCacheStore(connection.client, { name: 'shop' }), tags: () => ['products'] });
app.use(products).get('/products', ...);
await products.invalidateTag('products');   // forgotten in every process
```

Responses are `@nxgt/redis` cache records, checked by their schema when
read: one that no longer reads as a response is a miss. A tag is a Redis
set of the keys it names.

## Idempotent routes

```ts
import { idempotency } from '@alxia/redis';

app
	.use(idempotency(connection.client, { name: 'payments', required: true }))
	.post('/payments', { body: Payment }, async ({ body, reply }) => reply(201, await charge(body)));
```

A `POST` or `PATCH` with an `Idempotency-Key` runs once; every repeat gets
the first response back — status, headers, body — with
`Idempotent-Replayed: true`, from any process.

| case | answer |
| --- | --- |
| a repeat while the first runs | `409 { error: 'idempotency_in_progress', retryAfter }`, `Retry-After` |
| the same key, another request (method, path or body) | `422 { error: 'idempotency_key_reused' }` |
| no key, with `required` | `400 { error: 'idempotency_key_missing' }` |
| the route answers a 5xx, or streams | answered, not kept: the key is free again |

Every one is part of the guarded routes' types. Keys are scoped by the
route and by `scope(ctx)` — the client's address by default, a user id
when there is one — so two clients choosing the same key never see each
other's response. A replay never repeats `Set-Cookie`.

| option | default | |
| --- | --- | --- |
| `name` | required | names the stored keys |
| `ttl` | a day | seconds a response is replayed |
| `lease` | 10 s | milliseconds a running request holds its key, renewed while it runs |
| `wait` | 0 | milliseconds a repeat waits for the first before a 409 |
| `methods` | `POST`, `PATCH` | |
| `header` | `Idempotency-Key` | |
| `required` | `false` | |
| `scope` | the client's address | `(ctx) => string` |

## Caches and locks in the context

```ts
import { defineCache } from '@nxgt/redis';
import { redis } from '@alxia/redis';

const users = defineCache({ name: 'user', key: (id: string) => id, ttl: 300, schema: User });

app
	.use(redis(connection.client, { caches: { users } }))
	.get('/users/:id', async ({ cache, lock, params, reply }) => {
		const user = await cache.users.remember(params.id, () => loadUser(params.id)); // typed by User
		await lock(`user:${params.id}`, () => touch(user));
		return reply(200, user);
	});
```

`cache.<name>` is `@nxgt/redis`'s bound cache; `redis` the client itself,
for everything else.

## Testing

The package's specs run against `$REDIS_URL`, or a `redis-server` on
`$PATH` they start on a free port.

## API

| export | |
| --- | --- |
| `redisStore(client, { name })` | an `@alxia/rate-limit` store |
| `redisCacheStore(client, { name })` | an `@alxia/cache` store |
| `idempotency(client, options)` | the plugin |
| `redis(client, { caches? })` | the plugin: `redis`, `cache`, `lock` in the context |
| `IdempotencyOptions`, `IdempotencyErrorBody`, `RedisContext`, `BoundCaches` | its types |
