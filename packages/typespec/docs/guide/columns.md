# Scalars and columns

Two scalars for the strings every API has, and the columns
[`@nxgt/drizzle`](https://www.npmjs.com/package/@nxgt/drizzle) stamps a row
with, as models to spread.

## Scalars

```tsp
import "@typespec/http";
import "@nxgt/typespec";

using Http;
using Nxgt;

namespace Blog;

model Author {
  @visibility(Lifecycle.Read) id: uuid;
  email: email;
  site?: url;
}

@route("/authors/{authorId}")
@get op readAuthor(@path authorId: uuid): Author;
```

| Scalar | Emitted as | Generated | Refused |
| --- | --- | --- | --- |
| `uuid` | `$ref` to the schema `Uuid`: `type: string`, `format: uuid` | `type Uuid = string`, `zUuid = z.guid()` | `42`, in a path, a query or a body |
| `email` | `$ref` to the schema `Email`: `format: email` | `type Email = string`, `zEmail = z.email()` | `not an address` |
| `url` | TypeSpec's own: `format: uri`, inline | `z.url()` | `not a url` |

`z.guid()` checks the shape of a UUID, as JSON Schema's `uuid` does, not
the version and variant bits `z.uuid()` also checks.

## Columns

`@nxgt/drizzle/pg` declares a table's stamps with its column helpers. The
models here are the same columns, as the API sends them:

```ts
pgTable('posts', {
	id: id(),
	title: text('title').notNull(),
	...timestamps(),
	...version(),
	...actors(),
});
```

```tsp
model Post {
  @visibility(Lifecycle.Read) id: uuid;
  title: string;
  ...Timestamps;
  ...Versioned;
  ...Actors;
}
```

| Model | Properties | Visibility | drizzle |
| --- | --- | --- | --- |
| `Timestamps` | `createdAt`, `updatedAt: utcDateTime` | read | `timestamps()` |
| `SoftDelete` | `deletedAt: utcDateTime \| null` | read | `softDelete()` |
| `Versioned` | `version: integer`, at least 0 | read, update | `version()` |
| `Actors<Id = uuid>` | `createdBy`, `updatedBy`, `deletedBy: Id \| null` | read | `actors()` |

The server sets every read-only column, so `Create<Post>` and
`MergePatchUpdate<Post>` leave them out, and the generated `CreatePost` and
`PostMergePatchUpdate` have no `createdAt` a client could send.
`Actors<string>` or `Actors<integer>` match `actors('text')` or
`actors('integer')`.

## The version in an update

`version` is read with the row and sent back in an update. `@nxgt/drizzle`
takes it as a condition: it writes the update only while the row is still at
that version, and throws `OptimisticLockError` otherwise. Declare the
`Conflict` it becomes:

```tsp
@patch update(@path postId: uuid, @body post: MergePatchUpdate<Post>):
  Post | BadRequest | NotFound | Conflict;
```

```ts
import { OptimisticLockError } from '@nxgt/drizzle';
import { Hono } from 'hono';
import { createRoutes } from './generated/hono';
import type { ConflictBody } from './generated/types';

const app = new Hono();
createRoutes(app).patch('/posts/{postId}', async (c) => {
	try {
		const post = await posts.update(c.req.valid('param').postId, c.req.valid('json'));
		return c.json(post, 200);
	} catch (error) {
		if (!(error instanceof OptimisticLockError)) throw error;
		const body: ConflictBody = {
			status: 409,
			message: 'errors.version-conflict',
			timestamp: new Date().toISOString(),
		};
		return c.json(body, 409);
	}
});
```

In a merge patch, every property is optional, `version` too: an update
without it is not checked against the version.

## Names

`Uuid` and `Email` are schemas of their own, and their names are global: a
model named `Email` in a spec that also uses `email` collides with it
([troubleshooting](../troubleshooting.md)).
