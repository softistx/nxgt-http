# @nxgt/openapi-msw

[MSW](https://mswjs.io) handlers for the operations
[`@nxgt/openapi-codegen`](https://www.npmjs.com/package/@nxgt/openapi-codegen)
generates, bound to the same `operations` table as the client:

- **Typed by their operation.** A handler exists only for a method and a
  path the spec has, and its resolver receives the request's parameters and
  body with their types.
- **The server's refusals.** A request the spec refuses gets the 400 that
  [`@nxgt/openapi-hono`](https://www.npmjs.com/package/@nxgt/openapi-hono)
  answers, with the same issues.
- **Replies typed by their status.** In `reply(200, { … })`, the status comes
  first and types the body, so the editor offers its fields.
- **Mocks that fail when they drift.** A reply the spec does not declare
  throws, and the test fails instead of passing on a stale mock.

```ts
import { createOpenApiMsw } from '@nxgt/openapi-msw';
import { setupServer } from 'msw/node';
import { operations } from './generated/operations';

const mock = createOpenApiMsw(operations, { baseUrl: 'https://api.example.com' });

export const server = setupServer(
	mock.get('/employees/{id}', ({ param, reply }) =>
		reply(200, { id: param.id, name: 'Ada Lovelace' }),
	),
);
```

## Install

```sh
bun add -d @nxgt/openapi-msw msw @nxgt/openapi-httpyz @nxgt/httpyz
```

`msw` 2, `@nxgt/openapi-httpyz` and `@nxgt/httpyz` are peers. The mock reads
the `operations` table through the binding's types, and checks with the
client's schema checker.

## Setup

Generate the spec's code with
[`@nxgt/openapi-codegen`](https://www.npmjs.com/package/@nxgt/openapi-codegen),
then bind its `operations` table:

```ts
import { createOpenApiMsw } from '@nxgt/openapi-msw';
import { operations } from './generated/operations';

export const mock = createOpenApiMsw(operations, {
	baseUrl: 'https://api.example.com/v1',
});
```

`baseUrl` is where the app calls the API. Without it, the paths match on any
origin. Every type is inferred from the table, as
[`createOpenApiClient`](https://www.npmjs.com/package/@nxgt/openapi-httpyz)
infers it.

## Handlers

A handler is registered by method and path, as the spec writes the path, or
by `operationId`. Each returns an MSW handler, for `setupServer`,
`setupWorker` or `server.use()`:

```ts
server.use(
	mock.get('/employees/{id}', ({ param, reply }) => reply(200, employees[param.id])),
	mock.op('createEmployee', ({ json, reply }) => reply(201, { id: 3, ...json })),
);
```

The resolver receives the request as the server reads it:

| Field | What it holds |
| --- | --- |
| `param`, `query`, `header` | the path parameters, the query and the declared headers, as the spec's validators output them: `param.id` is a number when the spec says `integer` |
| `json`, `form`, `text`, `body` | the body, by its media type: parsed JSON, a form's fields (a name sent twice is a list, a file a `File`), text, or a binary body as a `Blob` |
| `reply` | builds a declared reply. See [Replies](#replies) |
| `request` | the `Request`, its body unread |
| `cookies`, `operationId` | the request's cookies, and the operation's id |

Only the methods the spec has an operation for exist: without a PATCH
operation there is no `mock.patch`. A path or an `operationId` the spec lacks
does not compile, and throws when registered.

## Replies

```ts
mock.get('/employees/{id}', ({ param, reply }) =>
	param.id === 0
		? reply(404, { message: 'errors.not-found' })
		: reply(200, { id: param.id, name: 'Ada Lovelace' }),
);
```

`reply(status, body, init)` writes the body as the status's media type
carries it: JSON, text, a form, or binary as it is. A status without content
takes no body: `reply(204)`. The `Content-Type` is the declared one. When a
status declares several, `init.type` picks one, and `init.headers` adds
headers:

```ts
reply(400, { title: 'Invalid' }, { type: 'application/problem+json', headers: { 'x-trace': id } });
```

The resolver may also return:

- a `Response` of its own, as MSW's `HttpResponse.error()` or `passthrough()`
  do, which is sent as it is and not checked;
- nothing, and MSW tries the next handler.

## Validation

- **The request.** It is read and checked as `@nxgt/openapi-hono` reads and
  checks it, with the validators of the same `operations` table. A request
  the server would refuse is answered with its 400, and the resolver does
  not run:

  ```json
  { "status": 400, "message": "errors.validation-failed", "timestamp": "…", "issues": [{ "target": "query", "path": ["page"], "code": "too_small", "message": "…" }] }
  ```

  A body that is not JSON, has the wrong `Content-Type`, or is missing when
  required gets the server's own issue codes: `invalid_json`,
  `invalid_content_type`, `missing_body`. Answer a refusal your own way with
  `onValidationError`.
- **The reply.** A body `reply()` wrote is checked against the status's
  schema, as JSON carries it, so a `Date` is checked as its text. A mock that
  does not match throws a `MockReplyError` naming its issues. MSW then
  answers with a 500, and the test that made the request fails. A status the
  operation does not declare throws too.

`validate: false` turns off both checks. `{ request: false }` or
`{ reply: false }` turns off one.

## API

### Functions

#### createOpenApiMsw

```ts
function createOpenApiMsw<Ops extends OperationsShape<Ops>, Routes = RoutesOf<Ops>>(
	operations: OperationTable<Ops>,
	options?: OpenApiMswOptions,
): OpenApiMsw<Ops, Routes>;
```

Binds the generated `operations` table. `Ops` is inferred from it, and
`Routes` defaults to `RoutesOf<Ops>`. See [Setup](#setup).

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `baseUrl` | `string` | any origin | where the app calls the API. The paths are matched under it |
| `validate` | `boolean \| { request?: boolean; reply?: boolean }` | `true` | checks the request and the replies of `reply()`. See [Validation](#validation) |
| `onValidationError` | `(failure: ValidationFailure, request: Request) => Response \| undefined \| Promise<…>` | the 400 | answers a request the spec refuses. Return nothing for the default |

### The mock

#### Path methods

```ts
mock.get<P extends PathsOf<Routes, 'get'>>(path: P, resolver: MockResolver<Ops, IdOf<Ops, Routes, 'get', P>>, options?: RequestHandlerOptions): HttpHandler;
// and put, post, delete, options, head, patch, trace, query: each the spec has an operation for
```

The handler of the operation at a method and a path, as the spec writes it:
`mock.get('/employees/{id}', resolver)`. `options` are MSW's, such as
`{ once: true }`. Throws for a path with no operation for the method.

#### op

```ts
mock.op<K extends keyof Ops & string>(id: K, resolver: MockResolver<Ops, K>, options?: RequestHandlerOptions): HttpHandler;
```

The handler of an operation, by its `operationId`. Throws for an id the table
does not have.

#### operations

```ts
readonly mock.operations: OperationTable<Ops>;
```

The generated table the mock was bound to.

### Classes

#### MockReplyError

```ts
class MockReplyError extends Error {
	readonly failure: ValidationFailure; // kind: 'response', with the status and the issues
}
```

Thrown by a handler whose reply the spec does not declare: its status, its
media type or its body. Its message names the operation and each issue.

### Types

#### OpenApiMsw

```ts
type OpenApiMsw<Ops extends OperationsShape<Ops>, Routes = RoutesOf<Ops>> = {
	op: …; // see op
	readonly operations: OperationTable<Ops>;
} & MockPathMethods<Ops, Routes>;
```

What `createOpenApiMsw()` returns. `MockPathMethods<Ops, Routes>` holds the
[path methods](#path-methods) of the methods the spec has.

#### MockResolver

```ts
type MockResolver<Ops, K extends keyof Ops> = (info: MockInfo<Ops, K>) => MockResult | Promise<MockResult>;
type MockResult = Response | undefined | void;
```

A handler's resolver: it returns a reply of `reply()`, a `Response` of its
own, or nothing.

#### MockInfo

```ts
type MockInfo<Ops, K extends keyof Ops> = MockInput<Ops, K> & {
	readonly request: Request;
	readonly cookies: Record<string, string>;
	readonly operationId: K;
	readonly reply: Reply<Ops[K]['reply'] & DeclaredReply>;
};
```

What a resolver is called with. `MockInput<Ops, K>` is the request's
`param`, `query`, `header` and body. See [Handlers](#handlers).

#### Reply

```ts
type Reply<R extends DeclaredReply> = <Status extends R['status']>(
	status: Status,
	...rest: ReplyArgs<Extract<R, { status: Status }>>
) => Response;
```

The `reply` a resolver receives. `ReplyArgs` is the status's body and its
init, or its init alone when it has no content. `DeclaredReply` is a reply
as the generated `ClientOperations` has it, `{ status, type, data }`.

#### ReplyInit

| Field | Type | Description |
| --- | --- | --- |
| `headers` | `HeadersInit` | headers of the reply. A `Content-Type` here wins over the declared one |
| `type` | one of the status's media types | the media type to reply with. Default: the first declared |

#### OpenApiMswOptions

The options of `createOpenApiMsw()`, in its [table](#createopenapimsw).

## Traps

- **Streams have no typed events yet.** For a server-sent events or JSON
  Lines reply, `reply()` takes the whole body, as text or a `Blob`, and does
  not check it item by item.
- **A `Response` of your own is not checked.** Only the replies `reply()`
  writes are.
- **`baseUrl` must be where the app calls the API**, its path prefix
  included. Otherwise the request goes unhandled, and MSW warns.
- **A binary body arrives as a `Blob`,** whatever the client sent it as.
