# Error replies

`@nxgt/typespec` declares the error replies the `@nxgt/*` packages send, so a
spec names them instead of describing them again.

## A whole spec

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

The spec is split by role, as it grows: `main.tsp` assembles, `models/`
holds the shapes and `routes/` the operations and their errors.

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

```tsp
// api/routes/posts.tsp
import "@typespec/http";
import "@nxgt/typespec";

using Http;
using Nxgt;

namespace Blog;

@route("/posts")
interface Posts {
  @get getPost(@path postId: string): Post | NotFound;
}
```

```ts
// openapi-codegen.config.ts
import { defineConfig } from '@nxgt/openapi-codegen';

export default defineConfig({
	input: 'openapi/openapi.yaml',
	output: 'src/generated',
	hono: true,
});
```

```sh
bunx --no-install tsp compile api && bunx nxgt-openapi generate
```

A Hono handler then answers the 404 with the generated type. The generated
`hono.ts` imports
[`@nxgt/openapi-hono`](https://github.com/softistx/nxgt-http/blob/develop/packages/openapi-hono/README.md),
and its validators `zod`: install them with `hono`.

```sh
bun add @nxgt/openapi-hono hono zod
```


```ts
import { Hono } from 'hono';
import { createRoutes } from './generated/hono';
import type { NotFoundBody } from './generated/types';

const app = new Hono();
createRoutes(app).get('/posts/{postId}', (c) => {
	const body: NotFoundBody = {
		status: 404,
		message: 'errors.not-found',
		timestamp: new Date().toISOString(),
	};
	return c.json(body, 404);
});
```

## The envelope

Every error body is `ErrorBody<Status>`, the envelope of
`@nxgt/openapi-hono`'s own replies, which a handler answers with too:

```tsp
model ErrorBody<Status extends integer> {
  status: Status;        // the reply's status, repeated
  message: string;       // an i18n key: errors.not-found
  timestamp: utcDateTime;
}
```

`message` is a key for the client to translate, never a sentence. `status`
is a literal, so the generated type narrows on it:

```ts
export interface NotFoundBody {
	status: 404;
	message: string;
	timestamp: string;
}
```

## The 400

`@nxgt/openapi-hono` refuses a request its validators reject with a 400 that
lists every value refused:

```json
{
	"status": 400,
	"message": "errors.validation-failed",
	"timestamp": "2026-09-29T08:00:00.000Z",
	"issues": [
		{ "target": "json", "path": ["title"], "code": "too_small", "message": "Too small" }
	]
}
```

A handler may send a 400 of its own, without `issues`. `BadRequestBody`
describes both, with `issues` optional:

```tsp
@patch updatePost(@path postId: string, @body post: MergePatchUpdate<Post>): Post | BadRequest;
```

The generator declares the validators' 400 itself, as `ValidationErrorBody`,
on every operation that takes a parameter or a body, whether the spec says
so or not. Beside `BadRequest`, the 400 is typed
`BadRequestBody | ValidationErrorBody`. An app that answers a refused request
its own way, through `onValidationError`, turns that off with the generator's
[`validationErrors: false`](https://github.com/softistx/nxgt-http/blob/develop/packages/openapi-codegen/docs/guide/options.md#validationerrors).

## Each response

| Response | Status | Body | Sent when |
| --- | --- | --- | --- |
| `BadRequest` | 400 | `BadRequestBody` | the validators or a handler refuse the request |
| `Unauthorized` | 401 | `UnauthorizedBody` | no credentials, or invalid ones; a `@nxgt/janus-hono` guard sends `AuthenticationRequired` instead ([Authentication](auth.md)) |
| `Forbidden` | 403 | `ForbiddenBody` | authenticated, but not allowed; a `@nxgt/janus-hono` guard sends `AccessDenied` instead, and `janusErrors()` its own `{ code }` body ([Authentication](auth.md)) |
| `NotFound` | 404 | `NotFoundBody` | nothing is there |
| `Conflict` | 409 | `ConflictBody` | the request conflicts with the resource's state, such as a stale `version` |
| `UnprocessableEntity` | 422 | `UnprocessableEntityBody` | well-formed, but not something the server can act on |
| `TooManyRequests` | 429 | `TooManyRequestsBody` | too many requests; with the `RateLimit-*` headers and `Retry-After` ([Headers](headers.md)) |
| `InternalServerError` | 500 | `InternalServerErrorBody` | the server failed; with `validateResponses`, `@nxgt/openapi-hono` sends it with `errors.response-validation-failed` when a reply breaks the spec |
| `ErrorResponse<Status>` | any | `ErrorBody<Status>` | any other status |

Name them in an operation's return type, beside the success:

```tsp
@get getPost(@path postId: string): Post | NotFound | Unauthorized | Forbidden;
```

## Another status, named

`ErrorResponse<503>` works, but its body is emitted inline and generated as
`<Operation>503Response`. For a named schema, declare the body and the
response once:

```tsp
model ServiceUnavailableBody is ErrorBody<503>;

@error
model ServiceUnavailable {
  @statusCode _: 503;
  @body body: ServiceUnavailableBody;
}
```
