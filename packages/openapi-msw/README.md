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
- **Responses typed by their status.** In `response.ok({ … })` or
  `response(201).json({ … })`, the status comes first and types the body, so
  the editor offers its fields.
- **Mocks that fail when they drift.** A response the spec does not declare
  throws, and the test fails instead of passing on a stale mock.

```ts
import { createOpenApiMsw } from '@nxgt/openapi-msw';
import { setupServer } from 'msw/node';
import { operations } from './generated/operations';

const mock = createOpenApiMsw(operations, { baseUrl: 'https://api.example.com' });

export const handlers = [
	mock.get('/employees/{id}', ({ param, response }) =>
		response.ok({ id: param.id, name: 'Ada Lovelace' }),
	),
	mock.delete('/employees/{id}', ({ response }) => response.noContent()),
];

export const server = setupServer(...handlers);
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
by `operationId`. Each returns an MSW `HttpHandler`, for `setupServer`,
`setupWorker`, `server.use()` or a list of your own:

```ts
server.use(
	mock.get('/employees/{id}', ({ param, response }) => response.ok(employees[param.id])),
	mock.op('createEmployee', ({ json, response }) => response.created({ id: 3, ...json })),
);
```

The resolver receives the request as the server reads it:

| Field | What it holds |
| --- | --- |
| `param`, `query`, `header` | the path parameters, the query and the declared headers, as the spec's validators output them: `param.id` is a number when the spec says `integer` |
| `json`, `form`, `text`, `body` | the body, by its media type: parsed JSON, a form's fields (a name sent twice is a list, a file a `File`), text, or a binary body as a `Blob` |
| `response` | builds a declared response. See [Responses](#responses) |
| `bypass` | sends the request on to the network. See [Leaving the spec](#leaving-the-spec) |
| `request` | the `Request`, its body unread |
| `cookies`, `operationId` | the request's cookies, and the operation's id |

Only the methods the spec has an operation for exist: without a PATCH
operation there is no `mock.patch`. A path or an `operationId` the spec lacks
does not compile, and throws when registered.

## Responses

```ts
mock.get('/employees/{id}', ({ param, response }) =>
	param.id === 0
		? response.notFound({ message: 'errors.not-found' })
		: response.ok({ id: param.id, name: 'Ada Lovelace' }),
);
```

`response(status)` gives the writers of the status's body. Each writes the
body as its media type carries it, with the declared `Content-Type`:

| Writer | Writes |
| --- | --- |
| `json(data, options?)` | a JSON media type: `application/json`, `application/problem+json`… |
| `text(data, options?)` | a `text/*` media type, server-sent events included |
| `form(data, options?)` | `application/x-www-form-urlencoded` or `multipart/form-data`, from an object, a `FormData` or `URLSearchParams` |
| `binary(data, options?)` | any other media type, JSON Lines included: a `Blob`, a buffer, a stream |
| `body(data, options?)` | any media type the status declares |

A writer exists only for the media types its status declares, and its `data`
is typed by the one it writes. A status without content has
`body(options?)` alone: `response(204).body()`.

```ts
response(201).json(employee);
response(200).text('id,name\n1,Ada');
response(400).json(problem, { type: 'application/problem+json', headers: { 'x-trace': id } });
```

The options come after the body:

| Option | Type | Description |
| --- | --- | --- |
| `type` | one of the writer's media types | the media type to write. Required when the status declares several the writer could write, and the body is typed by it |
| `headers` | `HeadersInit` | headers of the response. A `Content-Type` here wins over the declared one |
| `statusText` | `string` | the response's status text |

### Presets

A preset is `response(status).body`, for a common status the operation
declares. `response.ok(item)` is `response(200).body(item)`:

| Preset | Status |
| --- | --- |
| `ok` | 200 |
| `created` | 201 |
| `accepted` | 202 |
| `noContent` | 204 |
| `badRequest` | 400 |
| `unauthorized` | 401 |
| `forbidden` | 403 |
| `notFound` | 404 |
| `conflict` | 409 |
| `unprocessableEntity` | 422 |
| `tooManyRequests` | 429 |
| `internalServerError` | 500 |

An operation without a 404 has no `response.notFound`. Any other declared
status goes through `response(status)`.

### Leaving the spec

A resolver returns a response of `response`, or nothing, and MSW tries the
next handler. Three ways out of the spec, none checked against it:

```ts
// A Response of your own: MSW's, or any other.
mock.get('/employees/{id}', ({ response }) => response.untyped(HttpResponse.error()));

// The request goes on to the network, as if no handler matched.
mock.get('/employees/{id}', ({ response }) => response.passthrough());

// The real response, read, then answered with a typed one.
mock.get('/employees/{id}', async ({ bypass, response }) => {
	const employee = await (await bypass()).json();
	return response.ok({ ...employee, name: 'Patched' });
});
```

`untyped()` takes any `Response` and gives it the type a resolver returns,
so it compiles. A bare `Response` returned from a resolver does not.
`bypass(init?)` sends the request past MSW, with `init` over it, and returns
the network's `Response`.

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
- **The response.** A body `response` wrote is checked against the status's
  schema, as JSON carries it, so a `Date` is checked as its text. A mock that
  does not match throws a `MockReplyError` naming its issues. MSW then
  answers with a 500, and the test that made the request fails. A status the
  operation does not declare, or a media type the status does not, throws
  too.

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
| `validate` | `boolean \| { request?: boolean; reply?: boolean }` | `true` | checks the request and the responses of `response`. See [Validation](#validation) |
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

### Constants

#### PRESETS

```ts
const PRESETS: { readonly ok: 200; readonly created: 201; /* … */ readonly internalServerError: 500 };
type Presets = typeof PRESETS;
```

The name and status of each [preset](#presets).

### Classes

#### MockReplyError

```ts
class MockReplyError extends Error {
	readonly failure: ValidationFailure; // kind: 'response', with the status and the issues
}
```

Thrown by a handler whose response the spec does not declare: its status,
its media type or its body. Its message names the operation and each issue.

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
type MockResult = MockResponse | undefined | void;
```

A handler's resolver: it returns a response of `response`, or nothing.

#### MockInfo

```ts
type MockInfo<Ops, K extends keyof Ops> = MockInput<Ops, K> & {
	readonly request: Request;
	readonly cookies: Record<string, string>;
	readonly operationId: K;
	readonly response: ResponseFactory<Ops[K]['reply'] & DeclaredReply>;
	bypass(init?: RequestInit): Promise<Response>;
};
```

What a resolver is called with. `MockInput<Ops, K>` is the request's
`param`, `query`, `header` and body. See [Handlers](#handlers).

#### ResponseFactory

```ts
type ResponseFactory<R extends DeclaredReply> =
	(<Status extends R['status']>(status: Status) => StatusResponse<Extract<R, { status: Status }>>) &
	ResponsePresets<R> & {
		untyped(response: Response): MockResponse;
		passthrough(): MockResponse;
	};
```

The `response` a resolver receives. `DeclaredReply` is a reply as the
generated `ClientOperations` has it, `{ status, type, data }`.
`ResponsePresets<R>` holds the [presets](#presets) of the statuses `R`
declares.

#### StatusResponse

```ts
type StatusResponse<R extends DeclaredReply> =
	| { body(options?: ResponseOptions<never>): MockResponse } // a status without content
	| ({ body: BodyWriter<R, Types> } & { json?; text?; form?; binary?: BodyWriter<R, …> });
```

What `response(status)` returns: `body`, and a writer for each media kind the
status declares. `MediaKindOf<Type>` gives the kind of a media type, as the
generator classifies it. See [Responses](#responses).

#### BodyWriter

```ts
type BodyWriter<R extends DeclaredReply, Types extends string> = (...args: BodyArgs<R, Types>) => MockResponse;
```

A writer. `BodyArgs` is `[data, options?]`, or `[data, options]` with
`options.type` required when `Types` holds several media types. `data` is
the body of the media type written.

#### ResponseOptions

The options after a body, in the [table](#responses) above.

#### MockResponse

```ts
type MockResponse = Response & { readonly [mocked]: true };
```

A `Response` built by `response`, the only kind a resolver returns.
`response.untyped()` makes one of any `Response`.

#### OpenApiMswOptions

The options of `createOpenApiMsw()`, in its [table](#createopenapimsw).

## Traps

- **Streams have no typed events yet.** For a server-sent events or JSON
  Lines response, `text()` or `binary()` takes the whole body, as text or a
  `Blob`, and does not check it item by item.
- **`untyped()`, `passthrough()` and `bypass()` are not checked.** Only the
  bodies `response` writes are.
- **`baseUrl` must be where the app calls the API**, its path prefix
  included. Otherwise the request goes unhandled, and MSW warns.
- **A binary body arrives as a `Blob`,** whatever the client sent it as.
