# Authentication

How an operation says it needs a session, and what it answers without one,
as [`@nxgt/janus`](https://www.npmjs.com/package/@nxgt/janus) serves it.

## Declaring it

```tsp
import "@typespec/http";
import "@nxgt/typespec";

using Http;
using Nxgt;

namespace Blog;

@route("/posts/{postId}/comments")
interface Comments {
  @get list(@path postId: string): Comment[];

  @useAuth(JanusAuth)
  @delete delete(@path postId: string, @path commentId: string):
    NoContentResponse | AuthenticationRequired | AccessDenied | ErrorWithoutBody<404>;
}
```

`@useAuth` is TypeSpec's own, from `@typespec/http`. On an interface or a
namespace, it covers every operation inside; `@useAuth(NoAuth)` opens one
of them again.

## The schemes

`@nxgt/janus` reads a session token from three places, in this order, and
takes the first it finds:

| Scheme | Where the token is | Emitted as |
| --- | --- | --- |
| `BearerAuth` | `Authorization: Bearer <token>` | `type: http`, `scheme: Bearer` |
| `SessionTokenAuth` | the `X-Session-Token` header | `type: apiKey`, `in: header` |
| `SessionCookieAuth` | the `janus-session` cookie | `type: apiKey`, `in: cookie` |

`JanusAuth` is the three, as alternatives: any one of them is enough. Each
is also usable alone, `@useAuth(BearerAuth)` for an API that only takes
the header. A janus app that renames its cookie declares its own:

```tsp
model AdminCookieAuth is ApiKeyAuth<ApiKeyLocation.cookie, "admin-session">;
```

The spec lists them under `securitySchemes`, for its readers and for the
clients generated from it. `@nxgt/openapi-codegen` does not read them:
checking the session is the guard's work, not the validators'.

## The refusals, without a body

The janus guards refuse a request with a status and nothing else:

| Guard | Refuses with | Declare |
| --- | --- | --- |
| `requireUser()` | 401: no session, or one the server does not know | `AuthenticationRequired` |
| `permission()` | 401: no session | `AuthenticationRequired` |
| `permission()` | 404: the object does not exist | `ErrorWithoutBody<404>` |
| `permission()` | 403: its user may not do this | `AccessDenied` |

The generated `hono.ts` types those replies without a body, so the route
answers them as the guard does:

```ts
createRoutes(app).delete('/posts/{postId}/comments/{commentId}', async (c) => {
	// … permission() has let the request through
	return c.body(null, 204);
});
```

A handler that sends one of them with a body does not type-check. With
`validateResponses`, `@nxgt/openapi-hono` checks a reply's body only where
the spec declares one, so it lets a body through on these at run time.

## Beside a handler's refusal

A handler that refuses on its own, after the guard, answers with the
envelope: `Unauthorized` or `Forbidden` ([Error replies](errors.md)). An
operation can declare the guard's 401 and the handler's 403:

```tsp
@useAuth(JanusAuth)
@post create(@body post: Create<Post>): {
  @statusCode _: 201;
  @body post: Post;
} | BadRequest | AuthenticationRequired | Forbidden;
```

Not both replies of one status, though: an operation that declares
`AuthenticationRequired` and `Unauthorized` gets a single 401, with the
envelope, and the reply without a body is lost without a warning. Declare
the one the route sends.
