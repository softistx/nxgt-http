# Resources

`Resource` gives a resource its five operations in one line: list, read,
create, update and delete, with the replies each one can send.

## One resource

```tsp
import "@typespec/http";
import "@nxgt/typespec";

using Http;
using Nxgt;

namespace Blog;

model Author {
  @visibility(Lifecycle.Read) id: uuid;
  name: string;
  email: email;
  ...Timestamps;
}

model AuthorFilters {
  /** Authors of this name. */
  @query name?: string;
}

@route("/authors")
interface Authors extends Resource<Author, AuthorFilters, SortField = "name" | "createdAt"> {}
```

| Operation | Route | Body | Answers |
| --- | --- | --- | --- |
| `listAuthors` | `GET /authors` | | `Page<Author>` |
| `readAuthor` | `GET /authors/{id}` | | `Author`, `NotFound` |
| `createAuthor` | `POST /authors` | `Create<Author>` | 201 `Author`, `BadRequest`, `Conflict` |
| `updateAuthor` | `PATCH /authors/{id}` | `MergePatchUpdate<Author>` | `Author`, `BadRequest`, `NotFound`, `Conflict` |
| `deleteAuthor` | `DELETE /authors/{id}` | | 204, `NotFound` |

The template carries `@operationIds`. `list` is named after the interface
that extends it, which holds the many, and `read`, `create`, `update` and
`delete` after `Item`, the one: `listAuthors`, `readAuthor`. The item's
name is its `@friendlyName`, if it has one. An item without a name of its
own, an anonymous model or an instance such as `Draft<Author>`, falls back to
the interface: `readDrafts`. An operation the extending interface declares
again is named after the interface too, unless it has its own `@operationId`. The generated `operations` has
one entry per id:

```ts
import { operations } from './generated/operations';

Object.keys(operations);
// ['listAuthors', 'createAuthor', 'readAuthor', 'updateAuthor', 'deleteAuthor']
```

The generator's own 400 is on every operation that takes a parameter or a
body, as always.

## Two resources of one item

Two interfaces extending `Resource` with one `Item` share `readAuthor`,
`createAuthor`, `updateAuthor` and `deleteAuthor`, which is an error,
`duplicate-operation-id`. Declare the operations of the second again, each
with its own `@operationId`, as an interface that extends overrides the
template's. Use the resource's `Id` in place of `uuid`, if it names one:

```tsp
import "@typespec/openapi";

using OpenAPI;

@route("/archived-authors")
interface ArchivedAuthors extends Resource<Author> {
  @get @operationId("readArchivedAuthor") read(@path id: uuid): Author | NotFound;
  @post @operationId("createArchivedAuthor") create(@body item: Create<Author>): {
    @statusCode _: 201;
    @body item: Author;
  } | BadRequest | Conflict;
  @patch @operationId("updateArchivedAuthor")
  update(@path id: uuid, @body item: MergePatchUpdate<Author>): Author | BadRequest | NotFound | Conflict;
  @delete @operationId("deleteArchivedAuthor") delete(@path id: uuid): NoContentResponse | NotFound;
}
```

## The template's arguments

`Resource<Item, Filters = {}, SortField = "id", Id = uuid>`. Name the ones
after `Filters`, as above, to skip those you keep:

- `Item`: the resource's model. `Create<Item>` and `MergePatchUpdate<Item>`
  leave its read-only properties out, such as `id` and the `Timestamps`.
- `Filters`: a model of `@query` properties, spread into `list`. Each is
  typed and checked, as any query parameter.
- `SortField`: the fields `list` may sort by, as a union of strings.
- `Id`: the type of `{id}`. `Id = integer` for a table whose id is
  `@nxgt/drizzle`'s `id('identity')`.

## Filters and sort

`list` takes the filters, the offset page's `page` and `pageSize`, and
`SortParameters<SortField>`:

| Query | Default | Checked |
| --- | --- | --- |
| `orderBy` | none: the server's order, the primary key with `@nxgt/drizzle` | one of the `SortField`s |
| `direction` | `asc` | `asc` or `desc` |

`?orderBy=email` on `Authors` is a 400: `email` is not a `SortField`. The
handler passes them to `@nxgt/drizzle`:

```ts
import { Hono } from 'hono';
import { createRoutes } from './generated/hono';

const app = new Hono();
createRoutes(app).get('/authors', async (c) => {
	const { name, page, pageSize, orderBy, direction } = c.req.valid('query');
	const found = await authors.paginate({
		where: name === undefined ? {} : { name },
		page,
		pageSize,
		// paginate takes the sort as an object of directions by field
		...(orderBy === undefined ? {} : { orderBy: { [orderBy]: direction } }),
	});
	return c.json(found, 200);
});
```

`paginateByCursor` takes them apart instead, `{ orderBy, direction }`, as
the query has them.

`SortParameters<Field>` works on its own too, in any list:

```tsp
@get list(...PageParameters, ...SortParameters<"createdAt" | "title">): Page<Post>;
```

## Changing an operation

An interface that extends `Resource` can declare one of its operations
again, and its own replaces the template's. A list paged by cursor:

```tsp
@route("/comments")
interface Comments extends Resource<Comment> {
  @get list(...CursorPageParameters): CursorPage<Comment>;
}
```

Add `@useAuth(JanusAuth)` on the interface to protect all five, and name the
guards' replies in the operations you declare again
([Authentication](auth.md)).
