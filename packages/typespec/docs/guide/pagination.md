# Pagination

Two ways to list a collection a page at a time, with the query and the page
[`@nxgt/drizzle`](https://www.npmjs.com/package/@nxgt/drizzle) and
[`@nxgt/mongo`](https://www.npmjs.com/package/@nxgt/mongo) use:

| | Query | Page | Use it when |
| --- | --- | --- | --- |
| Offset | `...PageParameters` | `Page<Item>` | a client jumps to a page, and shows a total |
| Cursor | `...CursorPageParameters` | `CursorPage<Item>` | a client scrolls on, and the collection is large or changes under it |

## Offset

```tsp
import "@typespec/http";
import "@nxgt/typespec";

using Http;
using Nxgt;

namespace Blog;

@route("/posts")
interface Posts {
  @get list(@query status?: PostStatus, ...PageParameters): Page<Post>;
}
```

`...PageParameters` adds two query parameters:

- `page`: 1-based, 1 when absent;
- `pageSize`: 20 when absent.

Both must be integers of at least 1, or `@nxgt/openapi-hono` answers its
400. `Page<Post>` is the schema `PostPage`:

```json
{ "items": [], "total": 42, "page": 3, "pageSize": 20, "pageCount": 3 }
```

`pageCount` is `ceil(total / pageSize)`, 0 when nothing matches. A page past
the last one has no items and the same `total`.

## Cursor

```tsp
@route("/posts/{postId}/comments")
interface Comments {
  @get list(
    @path postId: string,
    ...CursorPageParameters,
  ): CursorPage<Comment> | BadRequest | NotFound;
}
```

`...CursorPageParameters` adds:

- `after`: the previous page's `nextCursor`, absent for the first page;
- `limit`: 20 when absent, an integer of at least 1.

`CursorPage<Comment>` is the schema `CommentCursorPage`, with no total:

```json
{ "items": [], "nextCursor": "eyJpZCI6NDJ9" }
```

`nextCursor` is `null` on the last page. It is opaque: a client sends it
back as it is.

## Serving it

The generated query arrives checked, with its defaults filled in, so it
goes to `@nxgt/drizzle` as it is. The page it returns is the generated type,
when the table's rows are what the spec's `Post` describes:

```ts
import { Hono } from 'hono';
import { createRoutes } from './generated/hono';
import type { PostPage } from './generated/types';

const app = new Hono();
createRoutes(app).get('/posts', async (c) => {
	const { page, pageSize } = c.req.valid('query');
	const body: PostPage = await posts.paginate({ page, pageSize });
	return c.json(body, 200);
});
```

A cursor that was not written by the server, or for another ordering, makes
`@nxgt/drizzle` throw `InvalidCursorError`. That is the client's input:
declare `BadRequest` on the operation, as above, and answer it:

```ts
import { InvalidCursorError } from '@nxgt/drizzle';
import type { BadRequestBody, CommentCursorPage } from './generated/types';

createRoutes(app).get('/posts/{postId}/comments', async (c) => {
	const { after, limit } = c.req.valid('query');
	try {
		const body: CommentCursorPage = await comments.paginateByCursor({ after, limit });
		return c.json(body, 200);
	} catch (error) {
		if (!(error instanceof InvalidCursorError)) throw error;
		const body: BadRequestBody = {
			status: 400,
			message: 'errors.invalid-cursor',
			timestamp: new Date().toISOString(),
		};
		return c.json(body, 400);
	}
});
```

## The largest page

Neither `pageSize` nor `limit` has a maximum in the spec. A server lowers one
above its own maximum to it, as `@nxgt/drizzle` does with 100 by default,
rather than refusing the request. A client reads the `pageSize` the page
reports, not the one it asked for.

## Names

`Page<Item>` is named `<Item>Page`, and `CursorPage<Item>` `<Item>CursorPage`,
after the item's model: `PostPage`, `CommentCursorPage`. Those names are
global, as the library's other schemas are: a model named `PostPage` in the
spec collides with `Page<Post>`
([troubleshooting](../troubleshooting.md)).
