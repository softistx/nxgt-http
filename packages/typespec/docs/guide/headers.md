# Headers

The headers of an idempotent write and of a rate limit, with the replies
that go with them.

## An idempotent write

A client that may retry a write sends an `Idempotency-Key` with it: the
server writes once, and answers a retry with the first answer.

```tsp
import "@typespec/http";
import "@nxgt/typespec";

using Http;
using Nxgt;

namespace Blog;

@route("/posts")
interface Posts {
  @post create(...IdempotencyKeyHeader, @body post: Create<Post>): {
    @statusCode _: 201;
    ...IdempotentReplayedHeader;
    @body post: Post;
  } | BadRequest | IdempotencyInProgress | IdempotencyKeyReused;
}
```

- `...IdempotencyKeyHeader` adds the optional `Idempotency-Key` header, 1 to
  255 characters. The generated validators check it: an empty key, or a
  longer one, is a 400. A handler reads it as
  `c.req.valid('header')['idempotency-key']`.
- `...IdempotentReplayedHeader` declares `Idempotent-Replayed: true` on the
  reply that replays an earlier one.
- `IdempotencyInProgress` is the 409 of a key whose first request still
  runs, with `Retry-After` and the `ConflictBody` envelope. The client
  retries as it is.
- `IdempotencyKeyReused` is the 422 of a key sent again with another body,
  with the `UnprocessableEntityBody` envelope. The client takes a new key.

Both carry the `RateLimit-*` headers, as a route that also has a rate limit
answers them. An operation that declares `Conflict` too, for its optimistic
lock, gets one 409 with the description of the first, and the library warns,
`merged-status-reply`: declare one of the two, and tell them apart by the
`message` key ([troubleshooting](../troubleshooting.md)).

## A rate limit

```tsp
@post create(@body post: Create<Post>): {
  @statusCode _: 201;
  ...RateLimitHeaders;
  @body post: Post;
} | BadRequest | TooManyRequests;
```

| Header | Value |
| --- | --- |
| `RateLimit-Limit` | how many requests a full window allows |
| `RateLimit-Remaining` | how many more are allowed now, after this one |
| `RateLimit-Reset` | seconds until the window is full again, rounded up |
| `Retry-After` | seconds to wait before trying again: a delay, never a date |

`TooManyRequests`, `IdempotencyInProgress` and `IdempotencyKeyReused`
carry the three `RateLimit-*` headers already. `...RateLimitHeaders` adds
them to a reply the spec declares inline, such as the 201 above.

## What is checked

The generator checks a request's headers, as it checks its query: the
`Idempotency-Key` arrives valid, or the request is a 400. It does not check
a reply's headers: they are in the spec for a client to read, and the
handler sets them:

```ts
import { Hono } from 'hono';
import { createRoutes } from './generated/hono';

const app = new Hono();
createRoutes(app).post('/posts', async (c) => {
	const key = c.req.valid('header')['idempotency-key'];
	// … look the key up; on a replay, answer the post it wrote:
	const post = await replayed(key);
	c.header('Idempotent-Replayed', 'true');
	return c.json(post, 201);
});
```

Every header here is optional, in the spec as on the wire: a route without
an idempotency store or a rate limiter declares none of them.

## Not yet

`ETag`, `If-None-Match` and `If-Match` are not declared here: the
`@nxgt/*` packages do not send an `ETag` the same way yet. The optimistic
lock is the body's `version` ([Scalars and columns](columns.md)).
