# Error replies

`@nxgt/typespec` declares the error replies the `@nxgt/*` packages send, so a
spec names them instead of describing them again.

## The envelope

Every error body is `ErrorBody<Status>`, what `@nxgt/openapi-hono` answers
with:

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
@put update(@path id: string, @body article: Article): Article | BadRequest;
```

The generator declares the validators' 400 itself, as `ValidationErrorBody`,
on every operation that takes a parameter or a body, whether the spec says
so or not. Beside `BadRequest`, the 400 is typed
`BadRequestBody | ValidationErrorBody`.

## Each response

| Response | Status | Body | Sent when |
| --- | --- | --- | --- |
| `BadRequest` | 400 | `BadRequestBody` | the validators or a handler refuse the request |
| `Unauthorized` | 401 | `UnauthorizedBody` | no credentials, or invalid ones |
| `Forbidden` | 403 | `ForbiddenBody` | authenticated, but not allowed |
| `NotFound` | 404 | `NotFoundBody` | nothing is there |
| `Conflict` | 409 | `ConflictBody` | the request conflicts with the resource's state, such as a stale `version` |
| `UnprocessableEntity` | 422 | `UnprocessableEntityBody` | well-formed, but not something the server can act on |
| `TooManyRequests` | 429 | `TooManyRequestsBody` | too many requests |
| `InternalServerError` | 500 | `InternalServerErrorBody` | the server failed; `@nxgt/openapi-hono` sends it with `errors.response-validation-failed` when a reply breaks the spec |
| `ErrorResponse<Status>` | any | `ErrorBody<Status>` | any other status |

Name them in an operation's return type, beside the success:

```tsp
@get read(@path id: string): Article | NotFound | Unauthorized | Forbidden;
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
