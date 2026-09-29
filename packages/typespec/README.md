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
| `TooManyRequests` | 429 | `TooManyRequestsBody`, with the `RateLimit-*` headers and `Retry-After` |
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
  @get list(@path postId: string, ...CursorPageParameters): CursorPage<Comment> | BadRequest | NotFound;
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
server lowers it, as `@nxgt/drizzle` does. A cursor the server did not write
makes `@nxgt/drizzle` throw `InvalidCursorError`: answer it with the
`BadRequest` declared above
([Serving it](docs/guide/pagination.md#serving-it)).

### Authentication

Name how a request authenticates with `@useAuth`, and the guards' refusals
beside the success:

```tsp
@route("/posts/{postId}/comments/{commentId}")
interface Comments {
  @useAuth(JanusAuth)
  @delete delete(@path postId: string, @path commentId: string):
    NoContentResponse | AuthenticationRequired | AccessDenied | ErrorWithoutBody<404>;
}
```

`JanusAuth` is every way [`@nxgt/janus`](https://www.npmjs.com/package/@nxgt/janus)
reads a session token, and any one of them is enough:

| Scheme | Where the token is |
| --- | --- |
| `BearerAuth` | `Authorization: Bearer <token>` |
| `SessionTokenAuth` | the `X-Session-Token` header |
| `SessionCookieAuth` | the `janus-session` cookie |

The guards of [`@nxgt/janus-hono`](https://www.npmjs.com/package/@nxgt/janus-hono),
`session(auth, { required: true })` and `permission()`, refuse without a body:
`AuthenticationRequired` is their 401 and `AccessDenied` their 403, and
`ErrorWithoutBody<404>` the 404 of `permission()`. A handler's own refusal,
with the envelope, stays `Unauthorized` or `Forbidden`. The generated
`hono.ts` types the guards' replies as `c.body(null, 401)`. More in
[Authentication](docs/guide/auth.md).

### Scalars and columns

Type an id or an address with a scalar, and spread the columns
[`@nxgt/drizzle`](https://www.npmjs.com/package/@nxgt/drizzle) stamps a row
with:

```tsp
import "@nxgt/typespec";

using Nxgt;

namespace Blog;

model Post {
  @visibility(Lifecycle.Read) id: uuid;
  title: string;
  contact?: email;
  ...Timestamps;   // createdAt, updatedAt: read-only
  ...Versioned;    // version: read, and sent back in an update
  ...Actors;       // createdBy, updatedBy, deletedBy: read-only
}
```

| Name | Emitted as | Generated | drizzle |
| --- | --- | --- | --- |
| `uuid` | the schema `Uuid`, `format: uuid` | `Uuid`, `z.guid()` | `id()` |
| `email` | the schema `Email`, `format: email` | `Email`, `z.email()` | |
| `...Timestamps` | `createdAt`, `updatedAt`, read-only | left out of `Create<T>` and updates | `timestamps()` |
| `...SoftDelete` | `deletedAt: utcDateTime \| null`, read-only | | `softDelete()` |
| `...Versioned` | `version: integer`, read and update | kept in `MergePatchUpdate<T>` | `version()` |
| `...Actors<Id = uuid>` | `createdBy`, `updatedBy`, `deletedBy`, `Id \| null`, read-only | | `actors()` |

TypeSpec's own `url` is the address of a page, `format: uri`, generated as
`z.url()`. More in [Scalars and columns](docs/guide/columns.md).

### Headers

Spread the headers of an idempotent write and of a rate limit into an
operation and its replies:

```tsp
@post create(...IdempotencyKeyHeader, @body post: Create<Post>): {
  @statusCode _: 201;
  ...IdempotentReplayedHeader;
  ...RateLimitHeaders;
  @body post: Post;
} | BadRequest | IdempotencyInProgress | IdempotencyKeyReused | TooManyRequests;
```

| Name | Header | Where |
| --- | --- | --- |
| `IdempotencyKeyHeader` | `Idempotency-Key`, 1 to 255 characters, optional | the request: checked |
| `IdempotentReplayedHeader` | `Idempotent-Replayed: true` | a reply that replays an earlier one |
| `RateLimitHeaders` | `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset` | a rate-limited route's replies |
| `RetryAfterHeader` | `Retry-After`, in seconds | a 409 or a 429 |
| `IdempotencyInProgress` | 409, `ConflictBody`, `Retry-After` | the key's first request still runs |
| `IdempotencyKeyReused` | 422, `UnprocessableEntityBody` | the key was used with another body |

`TooManyRequests` carries the `RateLimit-*` headers and `Retry-After`. The
generator checks the request's `Idempotency-Key`; a reply's headers are
documented, not checked. More in [Headers](docs/guide/headers.md).

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

### Authentication

| Name | What it is |
| --- | --- |
| `JanusAuth` | `BearerAuth \| SessionTokenAuth \| SessionCookieAuth`, for `@useAuth` |
| `SessionTokenAuth` | an API key in the `X-Session-Token` header |
| `SessionCookieAuth` | an API key in the `janus-session` cookie |

### Scalars and columns

| Name | What it is |
| --- | --- |
| `uuid` | a string, `format: uuid`; the schema `Uuid` |
| `email` | a string, `format: email`; the schema `Email` |
| `Timestamps` | `createdAt`, `updatedAt: utcDateTime`, read-only |
| `SoftDelete` | `deletedAt: utcDateTime \| null`, read-only |
| `Versioned` | `version: integer`, read and update |
| `Actors<Id = uuid>` | `createdBy`, `updatedBy`, `deletedBy: Id \| null`, read-only |

### Responses

`AuthenticationRequired` (401) and `AccessDenied` (403), without a body, and
`ErrorWithoutBody<Status>` for any other status without a body.

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
- **One status, one reply.** An operation that declares both
  `AuthenticationRequired` and `Unauthorized` gets a single 401, with the
  envelope: the reply without a body is lost, without a warning. Declare the
  one the route sends: the guard's, or the handler's.
- **Both versions at once write two folders.** With
  `openapi-versions: ['3.1.0', '3.2.0']`, the emitter writes
  `3.1.0/openapi.yaml` and `3.2.0/openapi.yaml`: point the generator's input
  at one of them.
- **The library's schema names are global.** `BadRequestBody` …
  `InternalServerErrorBody`, `ValidationIssue`, `ValidationTarget`, `Uuid`,
  `Email`, and each `<Item>Page` and `<Item>CursorPage` are emitted under
  those names, without a namespace, once the spec uses them. A model of the
  same name in your spec then fails with `duplicate-type-name`
  ([troubleshooting](docs/troubleshooting.md)).

## Documentation

- [Error replies](docs/guide/errors.md): the envelope, each response, and
  what the generator makes of them;
- [Pagination](docs/guide/pagination.md): offset and cursor pages, and
  what a handler answers;
- [Authentication](docs/guide/auth.md): `JanusAuth`, and the guards'
  replies without a body;
- [Scalars and columns](docs/guide/columns.md): `uuid`, `email`, and the
  columns `@nxgt/drizzle` stamps;
- [Headers](docs/guide/headers.md): `Idempotency-Key`, the rate limit and
  `Retry-After`;
- [Operation ids](docs/guide/operation-ids.md): `@operationIds`, and what
  the generated client calls each operation;
- [troubleshooting](docs/troubleshooting.md);
- [the roadmap](docs/roadmap.md): resource templates, still to come.

## License

MIT
