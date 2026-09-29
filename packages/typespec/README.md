# @nxgt/typespec

nxgt's HTTP conventions as a [TypeSpec](https://typespec.io) library, so an
API spec states them in one word instead of rewriting them. Compile the spec to
OpenAPI 3.1 or 3.2 with `@typespec/openapi3`, then generate the code with
[`@nxgt/openapi-codegen`](https://github.com/softistx/nxgt-http/blob/develop/packages/openapi-codegen/README.md).
Each shape here is one the `@nxgt/*` packages already send on the wire.

## Install

```sh
bun add -d @nxgt/typespec @typespec/compiler @typespec/http @typespec/openapi @typespec/openapi3 @nxgt/openapi-codegen
```

`@typespec/compiler`, `@typespec/http` and `@typespec/openapi` 1.16 or later
are peer dependencies,
and `typescript` 6 too, as for every `@nxgt` package. `@typespec/openapi3`
compiles the spec, and `@nxgt/openapi-codegen` generates the code from it.
Emit OpenAPI 3.1 or 3.2 in `tspconfig.yaml`: `@typespec/openapi3` emits 3.0
by default, and the generator refuses it. Every convention here is compiled
to both in CI, and generates the same code from either.

```yaml
# api/tspconfig.yaml
emit:
  - '@typespec/openapi3'
options:
  '@typespec/openapi3':
    openapi-versions: ['3.1.0']
    emitter-output-dir: '{project-root}/../openapi'
    output-file: openapi.yaml
```

## Usage

### A spec split across files

A spec that grows is split by role: one file per resource's models, one per
resource's routes, and a `main.tsp` that only assembles them. Each file opens
the service's namespace again:

```text
api/
  main.tsp            imports every file below, and declares the service
  tspconfig.yaml
  models/
    author.tsp  post.tsp  comment.tsp
  routes/
    authors.tsp  posts.tsp  comments.tsp
```

```tsp
// api/main.tsp
import "@typespec/http";
import "./models/post.tsp";
import "./routes/posts.tsp";

using Http;

@service(#{ title: "Blog" })
namespace Blog;
```

```tsp
// api/models/post.tsp
namespace Blog;

model Post {
  @visibility(Lifecycle.Read) id: string;
  @minLength(1) title: string;
  body: string;
}
```

### Error replies

Import the library where the routes are, and name the errors each operation
can answer:

```tsp
// api/routes/posts.tsp
import "@typespec/http";
import "@nxgt/typespec";

using Http;
using Nxgt;

namespace Blog;

@route("/posts")
interface Posts {
  @get read(@path postId: string): Post | NotFound | Unauthorized;
  @post create(@body post: Create<Post>): {
    @statusCode _: 201;
    @body post: Post;
  } | BadRequest | Conflict | ErrorResponse<503>;
}
```

```sh
bunx --no-install tsp compile api && bunx nxgt-openapi generate -i openapi/openapi.yaml -o src/generated
```

Every error body has the envelope of `@nxgt/openapi-hono`'s own replies, its
400 and its 500, and a handler answers with the same envelope: `status`,
`message`, an i18n key rather than a sentence, and `timestamp`. The generated
types require all three:

```ts
// src/generated/types.ts (excerpt)
export interface NotFoundBody {
	status: 404;
	message: string;
	timestamp: string;
}
```

| Response | Status | Body |
| --- | --- | --- |
| `BadRequest` | 400 | `BadRequestBody`: the envelope, and `issues` when the validators refused the request |
| `Unauthorized` | 401 | `UnauthorizedBody` |
| `Forbidden` | 403 | `ForbiddenBody` |
| `NotFound` | 404 | `NotFoundBody` |
| `Conflict` | 409 | `ConflictBody` |
| `UnprocessableEntity` | 422 | `UnprocessableEntityBody` |
| `TooManyRequests` | 429 | `TooManyRequestsBody` |
| `InternalServerError` | 500 | `InternalServerErrorBody` |
| `ErrorResponse<Status>` | any | `ErrorBody<Status>` |

The generator also declares the validators' own 400, `ValidationErrorBody`,
on every operation that takes a parameter or a body. With `BadRequest`, a
400 reply is typed `BadRequestBody | ValidationErrorBody`.

### Pagination

Spread the query of a page into the operation's parameters, and answer the
page:

```tsp
@route("/posts")
interface Posts {
  @get list(@query status?: PostStatus, ...PageParameters): Page<Post>;
}

@route("/posts/{postId}/comments")
interface Comments {
  @get list(@path postId: string, ...CursorPageParameters): CursorPage<Comment> | NotFound;
}
```

The shapes are the ones
[`@nxgt/drizzle`](https://www.npmjs.com/package/@nxgt/drizzle) and
[`@nxgt/mongo`](https://www.npmjs.com/package/@nxgt/mongo) return, so a
handler answers their page as it is:

```ts
// src/generated/types.ts (excerpt)
export interface PostPage {
	items: Post[];
	total: number;
	page: number;
	pageSize: number;
	pageCount: number;
}

export interface CommentCursorPage {
	items: Comment[];
	nextCursor: string | null;
}
```

| Query | Default | Checked |
| --- | --- | --- |
| `page` | 1 | an integer, at least 1 |
| `pageSize` | 20 | an integer, at least 1 |
| `after` | none: the first page | a string, the previous page's `nextCursor` |
| `limit` | 20 | an integer, at least 1 |

A `pageSize` or `limit` above the server's maximum is not refused: the
server lowers it, as `@nxgt/drizzle` does. More in
[Pagination](docs/guide/pagination.md).

### Operation ids

TypeSpec names an operation after its interface, `Posts_list`, and the
generator turns that id into the client's method and its types' prefix. Put
`@operationIds` on the interface to name each operation after its method and
the interface instead:

```tsp
import "@typespec/openapi"; // for @operationId

using OpenAPI;

@route("/posts")
@operationIds
interface Posts {
  @get list(): Post[];                                     // listPosts
  @get @operationId("getPost") read(@path postId: string): Post | NotFound; // getPost
}
```

An operation's own `@operationId` wins. An interface that extends a marked
one, or an instance of a marked template, is named after itself. An operation
of a marked interface that has another operation's id is an error,
`duplicate-operation-id`. More in
[Operation ids](docs/guide/operation-ids.md).

## API

### Decorators

| Decorator | On | What it does |
| --- | --- | --- |
| `@operationIds` | an interface | names each operation `<operation><Interface>`, unless it has an `@operationId` |

### Models

| Model | What it is |
| --- | --- |
| `ErrorBody<Status>` | `{ status: Status, message: string, timestamp: utcDateTime }` |
| `BadRequestBody` | `ErrorBody<400>` and `issues?: ValidationIssue[]` |
| `UnauthorizedBody` … `InternalServerErrorBody` | `ErrorBody<401>` … `ErrorBody<500>`, one per response above |
| `PageParameters` | the query `page` and `pageSize`, to spread into an operation's parameters |
| `Page<Item>` | `{ items: Item[], total, page, pageSize, pageCount }`, the schema `<Item>Page` |
| `CursorPageParameters` | the query `after` and `limit` |
| `CursorPage<Item>` | `{ items: Item[], nextCursor: string \| null }`, the schema `<Item>CursorPage` |
| `ValidationIssue` | `{ target: ValidationTarget, path: (string \| integer)[], code: string, message: string }` |
| `ValidationTarget` | `"param" \| "query" \| "header" \| "json" \| "form" \| "body" \| "response"` |

### Responses

`BadRequest`, `Unauthorized`, `Forbidden`, `NotFound`, `Conflict`,
`UnprocessableEntity`, `TooManyRequests`, `InternalServerError`, each an
`@error` model with its `@statusCode` and body, and
`ErrorResponse<Status>` for any other status.

## Traps

- **Do not declare a schema named `ValidationErrorBody`.** The generator
  declares it itself, and two schemas of that name fail with
  `name_collision`. `BadRequestBody` carries the `issues` instead.
- **`ErrorResponse<503>`'s body is emitted inline**, and generated as
  `<Operation>503Response`. For a named schema, name the body and the
  response:

  ```tsp
  model ServiceUnavailableBody is ErrorBody<503>;

  @error
  model ServiceUnavailable {
    @statusCode _: 503;
    @body body: ServiceUnavailableBody;
  }
  ```
- **Both versions at once write two folders.** With
  `openapi-versions: ['3.1.0', '3.2.0']`, the emitter writes
  `3.1.0/openapi.yaml` and `3.2.0/openapi.yaml`: point the generator's input
  at one of them.
- **The library's schema names are global.** `BadRequestBody` …
  `InternalServerErrorBody`, `ValidationIssue`, `ValidationTarget`, and each
  `<Item>Page` and `<Item>CursorPage` are emitted under those names, without
  a namespace. A model of the same name
  in your spec fails with `duplicate-type-name`
  ([troubleshooting](docs/troubleshooting.md)).

## Documentation

- [Error replies](docs/guide/errors.md): the envelope, each response, and
  what the generator makes of them;
- [Pagination](docs/guide/pagination.md): offset and cursor pages, and
  what a handler answers;
- [Operation ids](docs/guide/operation-ids.md): `@operationIds`, and what
  the generated client calls each operation;
- [troubleshooting](docs/troubleshooting.md);
- [the roadmap](docs/roadmap.md): auth, scalars, headers and
  resource templates, still to come.

## License

MIT
