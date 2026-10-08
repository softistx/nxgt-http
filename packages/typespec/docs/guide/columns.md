# Scalars and columns

Scalars for the ids and addresses every API has, and the columns
[`@nxgt/drizzle`](https://www.npmjs.com/package/@nxgt/drizzle) stamps a row
with, as models to spread. The other scalars, by category, are in
[Scalars](scalars.md).

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
  site?: httpUrl;
}

@route("/authors/{authorId}")
@get op readAuthor(@path authorId: uuid): Author;
```

| Scalar | Emitted as | Generated | Refused |
| --- | --- | --- | --- |
| `uuid` | `$ref` to the schema `UUID`: `type: string`, `format: uuid`, a pattern, `x-nxgt-scalar: UUID` | `type UUID = string`, `zUUID = z.guid().regex(…)` | `42`, a UUID with no hyphens or of version 9, in a path, a query or a body |
| `email` | an alias of `emailAddress`: `$ref` to the schema `EmailAddress`, `format: email`, a pattern, `x-nxgt-scalar: EmailAddress` | `type EmailAddress = string`, `zEmailAddress = z.email().regex(…)` | `not an address`, `ada@localhost` |
| `httpUrl` | `$ref` to the schema `URL`: `format: uri`, a pattern for `http:` and `https:`, `x-nxgt-scalar: URL` | `type URL = string`, `zURL = z.url().regex(…)` | `not a url`, `javascript:alert(1)` |

TypeSpec's own `url` takes any scheme, inline, as `z.url()`; `httpUrl` is
the `http:` and `https:` page address. `z.url()` accepts `javascript:alert(1)`
on its own: it is the pattern after it that refuses it. Likewise `z.email()`
refuses `ada@x.xn--p1ai`, an internationalised top-level domain the pattern
accepts, so `email` refuses it too.

`uuid` takes an RFC 9562 UUID, any version 1 to 8 with the RFC variant, or
the nil or the max UUID, in any case, as `@nxgt/graphql-scalars`' `UUID`
does: the pattern adds those checks to the shape `z.guid()` checks. `uuidV4`,
`uuidV7` and `guid` (any 8-4-4-4-12 hexadecimal) are the narrower and the
looser ones. `email` is `emailAddress`, under the name it had first.

The schema names changed in 0.10.0: `Uuid` and `Email` became `UUID` and
`EmailAddress`, and a UUID of no known version is refused. A spec that needs
the old shape-only id writes `guid`.

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
@patch updatePost(@path postId: uuid, @body post: MergePatchUpdate<Post>):
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

`UUID` and `EmailAddress` are schemas of their own, and their names are global: a
model named `EmailAddress` in a spec that also uses `email` collides with it
([troubleshooting](../troubleshooting.md)).
