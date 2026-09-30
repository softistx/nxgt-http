# Sorting

`SortParameters<Field>` gives a list the query `orderBy` and `direction`,
checked against the fields you name, as `@nxgt/drizzle` sorts a page.

## A filtered, sorted list

Write the filters as a model of `@query` properties, and spread it into the
list with `PageParameters` and `SortParameters`:

```tsp
import "@typespec/http";
import "@nxgt/typespec";

using Http;
using Nxgt;

@service(#{ title: "Blog" })
@operationIds
namespace Blog;

model Author {
  @visibility(Lifecycle.Read) id: uuid;
  name: string;
  email: email;
  ...Timestamps;
}

/** What the author list filters on. */
model AuthorFilters {
  /** Authors of this name. */
  @query name?: string;
}

@route("/authors")
interface Authors {
  @get listAuthors(
    ...AuthorFilters,
    ...PageParameters,
    ...SortParameters<"name" | "createdAt">,
  ): Page<Author>;

  @get getAuthor(@path id: uuid): Author | NotFound;
}
```

`GET /authors?name=Ada&orderBy=name&direction=desc` is one page of the
authors named Ada, by name, descending. The list is an operation like any
other, and `@operationIds` gives it the id `listAuthors`
([Operation ids](operation-ids.md)).

## The query

```tsp
model SortParameters<Field extends string> {
  @query orderBy?: Field;
  @query direction?: "asc" | "desc" = "asc";
}
```

| Query | Type | Default | Checked |
| --- | --- | --- | --- |
| `orderBy` | `Field` | none: the server's order, the primary key with `@nxgt/drizzle` | one of the `Field`s |
| `direction` | `"asc" \| "desc"` | `asc` | `asc` or `desc` |

`?orderBy=email` on `Authors` is a 400: `email` is not one of the fields.
`?direction=up` is a 400 too. The validators fill in the default, so a
handler always reads a `direction`.

`Field` is a union of strings: the fields a client may sort by, not every
property of the model.

## Filters

Each property of the filters model is a query parameter, typed and checked
like any other. A filter that is not a string says so:

```tsp
enum PostStatus {
  draft,
  published,
}

model PostFilters {
  @query status?: PostStatus;
  @query authorId?: uuid;
}

@route("/posts")
interface Posts {
  @get listPosts(
    ...PostFilters,
    ...PageParameters,
    ...SortParameters<"createdAt" | "title">,
  ): Page<Post>;
}
```

## Serving it with `@nxgt/drizzle`

The handler reads the query the generator checked, and passes it to the
repository:

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

- `authors` is the `@nxgt/drizzle` repository of the table.
- `where` is an exact equality per field: a filter that is absent is left
  out, not passed as `undefined`.
- The sort is spread only when `orderBy` is there, which keeps the call
  valid under `exactOptionalPropertyTypes`.
- `paginate` returns the `Page<Author>` the spec declares, as it is.

`paginateByCursor` takes the sort apart instead, `{ orderBy, direction }`, as
the query has them; spread `CursorPageParameters` in place of
`PageParameters` for it ([Pagination](pagination.md)).
