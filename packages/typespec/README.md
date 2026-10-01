# @nxgt/typespec

nxgt's HTTP conventions as a [TypeSpec](https://typespec.io) library, so an
API spec states them in one word instead of rewriting them. Compile the spec to
OpenAPI 3.1 or 3.2 with `@typespec/openapi3`, then generate the code with
[`@nxgt/openapi-codegen`](https://github.com/softistx/nxgt-http/blob/develop/packages/openapi-codegen/README.md).
Each shape here is one the `@nxgt/*` packages already send on the wire.

## Start a project

`tsp init` with the package's template starts an API project with these
conventions in place. Run it in an empty directory:

```sh
npx --package=@typespec/compiler tsp init https://unpkg.com/@nxgt/typespec/templates/scaffolding.json \
  --template nxgt -y --project-name petstore
npx tsp compile .
npx nxgt-openapi generate
```

It installs the compiler, `@typespec/http`, `@typespec/openapi`,
`@typespec/openapi3`, this package and `@nxgt/openapi-codegen`, and writes:

- `tspconfig.yaml`: the linter's recommended rules, and OpenAPI 3.1 written
  to `openapi/openapi.yaml`;
- `main.tsp`: the service with `@operationIds`, and a `Users` resource with a
  paged, sorted list, `get`, `create`, `update` and `delete`, and their error
  aliases;
- `openapi-codegen.config.ts`: the generator's input, and `src/generated`
  with the Hono routes;
- `README.md`: the `api` and `api:check` scripts to add to `package.json`.

Drop `-y` and its options to be asked instead. The next steps, serving the
routes and renaming the resource, are in
[Getting started](docs/guide/getting-started.md).

## Install

For an existing project, install the library and its peers:

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
  @get getPost(@path postId: string): Post | NotFound | Unauthorized;
  @post createPost(@body post: Create<Post>): {
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

Each verb has an alias for the errors it usually answers, so a resource's
operations do not repeat the same unions. Combine them, and add a response
an alias leaves out:

```tsp
@route("/users")
interface Users {
  @get list(...PageParameters): Page<User> | ListErrors;
  @get get(@path id: uuid): User | GetErrors;
  @post create(@body user: User): User | CreateErrors | AuthErrors | TooManyRequests;
  @patch update(@path id: uuid, @body user: User): User | UpdateErrors;
  @delete delete(@path id: uuid): NoContentResponse | DeleteErrors;
}
```

An alias is exactly its union, so the OpenAPI it emits is the same as
writing the responses out.

### Pagination

Spread the query of a page into the operation's parameters, and answer the
page:

```tsp
@route("/posts")
interface Posts {
  @get listPosts(@query status?: PostStatus, ...PageParameters): Page<Post>;
}

@route("/posts/{postId}/comments")
interface Comments {
  @get findPostComments(@path postId: string, ...CursorPageParameters): CursorPage<Comment> | BadRequest | NotFound;
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
  @delete deletePostComment(@path postId: string, @path commentId: string):
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
@post createPost(...IdempotencyKeyHeader, @body post: Create<Post>): {
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
| `IdempotencyInProgress` | 409, `ConflictBody`, `RateLimit-*`, `Retry-After` | the key's first request still runs |
| `IdempotencyKeyReused` | 422, `UnprocessableEntityBody`, `RateLimit-*` | the key was used with another body |

`TooManyRequests` carries the `RateLimit-*` headers and `Retry-After` too. The
generator checks the request's `Idempotency-Key`; a reply's headers are
documented, not checked. More in [Headers](docs/guide/headers.md).

### Sorting

Spread the sort into a list, beside its filters and its page:

```tsp
model AuthorFilters {
  @query name?: string;
}

@route("/authors")
interface Authors {
  @get listAuthors(
    ...AuthorFilters,
    ...PageParameters,
    ...SortParameters<"name" | "createdAt">,
  ): Page<Author>;
}
```

`orderBy` takes one of the fields named, and `direction` `asc` (the default)
or `desc`, as `@nxgt/drizzle` sorts a page: `?orderBy=email` is a 400. More,
with the handler, in [Sorting](docs/guide/sorting.md).

### Operation ids

TypeSpec names an operation after its interface, `Posts_listPosts`, and the
generator turns that id into the client's method and its types' prefix. Put
`@operationIds` on the service namespace: in an interface, a known verb takes
the interface's resource, and any other name is the id as written:

```tsp
@service(#{ title: "Blog" })
@operationIds
namespace Blog;

@route("/posts")
interface Posts {
  @get list(...PageParameters): Page<Post>;                          // listPosts
  @get @route("/{postId}") get(@path postId: uuid): Post | NotFound; // getPost
  @get @route("/by-slug/{slug}") findBySlug(@path slug: string): Post | NotFound; // findPostBySlug
}

@route("/posts/{postId}/comments")
interface Comments {
  @get findPostComments(@path postId: uuid, ...CursorPageParameters): CursorPage<Comment>; // findPostComments
}
```

| Verbs | Take | In `Users` |
| --- | --- | --- |
| `list`, `read`, `find`, `search`, `query`, `count`, `createMany`, `updateMany`, `deleteMany` | the plural: the interface's name | `listUsers`, `deleteManyUsers` |
| `get`, `create`, `update`, `patch`, `replace`, `upsert`, `delete` | the singular, by a short English rule | `createUser` |
| a verb, then `By…` | the singular before `By`; the plural after a `*Many` verb | `findUserById`, `deleteManyUsersByTeam` |

The singular rule knows `Categories`, `Addresses`, `Statuses` and `People`;
name the others with `@operationIds(#{ singular: "Member" })` on the
interface, and add verbs with `#{ verbs: #{ archive: "singular" } }`. Verbs
carry down: an interface has those of its namespaces, outermost first, then
those of the interfaces it extends, then its own, and the last one wins. An
operation outside an interface keeps its name, even `list`. On an interface,
`@operationIds` names that interface's operations, and those of the
interfaces extending it. An operation's own `@operationId` wins; the others
keep the emitter's names. Two operations of one id in one service are an
error, `duplicate-operation-id`.

A verb also names the method: an operation named after one of the library's
verbs, alone or before `By…`, and sent with another method is a warning,
`verb-method-mismatch`. A read is a `GET`, so a cache or a retry may treat
it as safe:

```tsp
@route("/users")
interface Users {
  @post @route("/search") search(@body criteria: string): User[]; // fine: GET or POST
  @post @route("/find") findById(@body id: uuid): User;             // warning: find is GET or HEAD
}
```

```text
warning @nxgt/typespec/verb-method-mismatch: findById is sent with POST, where its verb find is sent with GET or HEAD. Give it that method, or a name that is not a verb.
```

Give it the method, a name that is not a verb, or a
`#suppress "@nxgt/typespec/verb-method-mismatch" "<reason>"` line above it.
The verbs `verbs` adds are not checked, nor an operation with its own
`@operationId`. More, with each verb's methods, in
[Operation ids](docs/guide/operation-ids.md).

### Linter

Extend the library's ruleset in `tspconfig.yaml`, and `tsp compile` warns
where the spec strays from these conventions. Nothing runs without it:

```yaml
# api/tspconfig.yaml
linter:
  extends:
    - '@nxgt/typespec/recommended'
```

| Rule | Warns when | Fix |
| --- | --- | --- |
| `list-returns-page` | an operation named `list`, `search` or `query`, alone or before a capital letter (`listUsers`, not `listing`), answers an array | return `Page<Item>` or `CursorPage<Item>` |
| `service-operation-ids` | a `@service` namespace has no `@operationIds`, on itself or on a namespace around it | mark the namespace with `@operationIds` |
| `error-body-shape` | a reply of status 400 or above, or `default`, has a body without `status`, `message` and `timestamp` | declare one of the library's errors, or a body that spreads or extends `ErrorBody<Status>` |

```text
warning @nxgt/typespec/list-returns-page: listAll returns an array: return Page<Item> or CursorPage<Item>, which can carry a total or a next cursor.
```

A reply without a body, such as `AuthenticationRequired`, passes
`error-body-shape`. Turn a rule off for the spec under `linter: disable:`
with a reason, or for one operation with
`#suppress "@nxgt/typespec/<rule>" "<reason>"`. More, with a failing and a
passing example of each rule, in [Linter](docs/guide/linter.md).

## API

### Decorators

| Decorator | On | What it does |
| --- | --- | --- |
| `@operationIds(options?: OperationIdsOptions)` | a namespace or an interface | makes each operation's id its name, as written, or a known verb with the interface's resource (`list` in `Users` is `listUsers`), in the namespace however deep or in the interface, unless it has an `@operationId` |

`OperationIdsOptions` is `#{ singular?: string, plural?: string, verbs?: Record<"singular" | "plural"> }`:
`singular` and `plural` name an interface's resource, and `verbs` adds or
overrides verbs, on a namespace or an interface.

### Diagnostics

| Code | Reported when |
| --- | --- |
| `duplicate-operation-id` | error: an operation `@operationIds` names has the id of another operation in its service's document |
| `resource-name-on-namespace` | error: `@operationIds` on a namespace is given `singular` or `plural`, which name an interface's resource |
| `duplicate-status-reply` | error: an operation declares a reply without a body and one with a body of one status, which the emitter merges, losing the one without a body |
| `merged-status-reply` | warning: an operation declares two replies with a body of one status code, which the emitter merges under the first one's description |
| `verb-method-mismatch` | warning: an operation `@operationIds` names after one of the library's verbs, in an interface, is sent with a method that verb does not name: `create` with a `GET` |

### Linter rules

In the ruleset `@nxgt/typespec/recommended`; each is a warning, and named
`@nxgt/typespec/<rule>` in `tspconfig.yaml` and `#suppress`.

| Rule | Reported when |
| --- | --- |
| `list-returns-page` | an operation named `list`, `search` or `query`, alone or before a capital letter, has a success reply whose body is an array |
| `service-operation-ids` | a `@service` namespace is not marked with `@operationIds`, itself or by a namespace around it |
| `error-body-shape` | a reply of status 400 or above, of a range from 400 up, or `default`, has a body that is not a model with `status`, `message` and `timestamp` |

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

### Headers

| Model | What it is |
| --- | --- |
| `IdempotencyKeyHeader` | `Idempotency-Key`, 1 to 255 characters, optional: to spread into parameters |
| `IdempotentReplayedHeader` | `Idempotent-Replayed: "true"`, optional: to spread into a reply |
| `RateLimitHeaders` | `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`, integers, optional |
| `RetryAfterHeader` | `Retry-After`, seconds, optional |

### Sorting

| Model | What it is |
| --- | --- |
| `SortParameters<Field>` | the query `orderBy?: Field` and `direction?: "asc" \| "desc" = "asc"` |

### Responses

`AuthenticationRequired` (401) and `AccessDenied` (403), without a body, and
`ErrorWithoutBody<Status>` for any other status without a body.
`IdempotencyInProgress` (409) and `IdempotencyKeyReused` (422), with the
envelope and the rate limit's headers.

`BadRequest`, `Unauthorized`, `Forbidden`, `NotFound`, `Conflict`,
`UnprocessableEntity`, `TooManyRequests`, `InternalServerError`, each an
`@error` model with its `@statusCode` and body, and
`ErrorResponse<Status>` for any other status.

| Alias | What it is |
| --- | --- |
| `ListErrors` | `BadRequest` |
| `GetErrors` | `NotFound` |
| `CreateErrors` | `BadRequest \| Conflict` |
| `UpdateErrors` | `BadRequest \| NotFound \| Conflict` |
| `DeleteErrors` | `NotFound` |
| `AuthErrors` | `Unauthorized \| Forbidden`, with the envelope; a route that answers without a body declares `AuthenticationRequired \| AccessDenied` instead |

## Traps

- **`npx tsp init` without `--package=@typespec/compiler` runs another
  package.** Outside a project that has the compiler, `npx tsp` fetches
  `tsp`, an unrelated npm package. Name the compiler:
  `npx --package=@typespec/compiler tsp init …`.
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
- **One status, one reply.** `@typespec/openapi3` merges two replies of one
  status into one. With `AuthenticationRequired` and `Unauthorized`, the 401
  keeps the envelope and the reply without a body is lost: the library
  refuses it, `duplicate-status-reply`. With `Conflict` (which
  `CreateErrors` and `UpdateErrors` hold) beside
  `IdempotencyInProgress`, or `UnprocessableEntity` beside
  `IdempotencyKeyReused`, both bodies stay, under the first reply's
  description: the library warns, `merged-status-reply`. Declare the one the
  route sends; for the idempotent write, the `message` key tells them apart.
  Two plain bodies, `Post | Draft`, bodies of different content types, and
  two `@error` models without a `@statusCode` pass
  ([troubleshooting](docs/troubleshooting.md)).
- **An operation named exactly a verb, or a verb followed by `By…`,
  changes id on upgrade.** Before 0.5.0, `list` in a marked `Users` was
  `list` and `findById` was `findById`; they are now `listUsers` and
  `findUserById`, and the generated client's methods follow. A `list`
  beside a `listUsers` now collides with it. Keep the old id with its own
  `@operationId` (from `@typespec/openapi`):

  ```tsp
  @get @operationId("list") list(): User[];
  ```

  Since 0.6.0, `query` is a verb too: `query` in `Users` was `query` and is
  now `queryUsers`, and `queryByTeam` is `queryUserByTeam`.
  `@operationId("query")` keeps the old one. A verb sent with a method it
  does not name is now a warning, which fails a build run with
  `--warn-as-error`.
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

- [Getting started](docs/guide/getting-started.md): the `tsp init`
  template, the files it writes, and the steps from the spec to a Hono route;
- [Error replies](docs/guide/errors.md): the envelope, each response, the
  aliases by verb, and what the generator makes of them;
- [Pagination](docs/guide/pagination.md): offset and cursor pages, and
  what a handler answers;
- [Authentication](docs/guide/auth.md): `JanusAuth`, and the guards'
  replies without a body;
- [Scalars and columns](docs/guide/columns.md): `uuid`, `email`, and the
  columns `@nxgt/drizzle` stamps;
- [Headers](docs/guide/headers.md): `Idempotency-Key`, the rate limit and
  `Retry-After`;
- [Sorting](docs/guide/sorting.md): `orderBy` and `direction` beside a
  list's filters, and the `@nxgt/drizzle` call they map to;
- [Operation ids](docs/guide/operation-ids.md): `@operationIds`, each
  operation named as written or a verb with its resource, the method each
  verb is sent with, the options, and the ids it refuses;
- [Linter](docs/guide/linter.md): the ruleset `@nxgt/typespec/recommended`,
  each rule with a failing and a passing spec, and how to turn one off;
- [troubleshooting](docs/troubleshooting.md);
- [the roadmap](docs/roadmap.md): what is coming.

## License

MIT
