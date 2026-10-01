# @alxia/rate-limit

Rate limiting for [alxia](https://www.npmjs.com/package/@alxia/core), typed:
the 429 is part of every route behind the limit, so
[`@alxia/client`](https://www.npmjs.com/package/@alxia/client) reads it. No
dependency.

```sh
bun add @alxia/rate-limit
```

## Usage

```ts
import { rateLimit } from '@alxia/rate-limit';

const app = alxia()
	.get('/health', ...)                                  // not limited
	.use(rateLimit({ limit: 100, windowMs: 60_000 }))
	.get('/search', ({ rateLimit, reply }) => ...);      // limited; rateLimit.remaining

const result = await api.get('/search');
if (result.status === 429) result.data.retryAfter;      // seconds
```

Past the limit, a 429 with `Retry-After` and
`{ error: 'rate_limited', retryAfter }`. Every counted response carries the
IETF draft's `RateLimit-Limit`, `-Remaining`, `-Reset` and `-Policy`.

## Options

| option | default | |
| --- | --- | --- |
| `limit` | required | requests per window |
| `windowMs` | required | the window, in milliseconds |
| `key` | the client's address | what is counted: `(ctx) => string \| undefined`; `undefined` is not counted |
| `store` | `MemoryStore` | where: implement `RateLimitStore` for Redis or a database |
| `skip` | none | requests not counted |
| `headers` | `'draft'` | `'legacy'` for `X-RateLimit-*`, or `false` |

Behind a proxy, give the app an `ip` option that reads the header it sets:
`alxia({ ip: (request) => request.headers.get('x-real-ip') ?? undefined })`.

## A store of your own

```ts
const store: RateLimitStore = {
	async hit(key, windowMs) {
		const count = await redis.incr(key);
		if (count === 1) await redis.pexpire(key, windowMs);
		return { count, resetAt: Date.now() + (await redis.pttl(key)) };
	},
	reset: (key) => redis.del(key),
};
```

## API

| export | |
| --- | --- |
| `rateLimit(options)` | the plugin: an app that derives `rateLimit` |
| `MemoryStore` | a fixed window in one process's memory |
| `RateLimitStore`, `Hits` | a store's contract |
| `RateLimitedBody`, `RateLimitInfo`, `RateLimitOptions` | its types |
