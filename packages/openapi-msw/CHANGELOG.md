# @nxgt/openapi-msw

## 0.2.0

### Minor Changes

- [#39](https://github.com/softistx/nxgt-http/pull/39) [`03dff7a`](https://github.com/softistx/nxgt-http/commit/03dff7a59fc3eae7a2390390c7eee77acad0cc8e) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Breaking: `reply(status, body)` is replaced by `response`, still typed by
  the status that comes first:
  
  - `response(201).json(item)`, and `text`, `form` and `binary`: one writer per
    media kind the status declares. `body` writes any of them.
  - Presets for the common statuses the operation declares: `response.ok(item)`,
    `created`, `accepted`, `noContent`, `badRequest`, `unauthorized`,
    `forbidden`, `notFound`, `conflict`, `unprocessableEntity`,
    `tooManyRequests`, `internalServerError`.
  - Options after the body: `type`, `headers` and `statusText`. `type` is
    required when the status declares several media types the writer could
    write, and the body is typed by it.
  - `response.untyped(HttpResponse.error())` sends a `Response` of your own
    as it is, unchecked. A resolver no longer returns a bare `Response`.
  - `response.passthrough()`, and `bypass()` in the resolver's argument, which
    sends the request on to the network and returns the real `Response`.
  
  Migrate `reply(200, item)` to `response.ok(item)` or
  `response(200).json(item)`, and `reply(204)` to `response.noContent()`.
  A `Response` a resolver returned goes through `response.untyped()`.

## 0.1.0

### Minor Changes

- [#35](https://github.com/softistx/nxgt-http/pull/35) [`1645536`](https://github.com/softistx/nxgt-http/commit/1645536e40779593f87d2d6769e9b1df5d3c8489) Thanks [@SteveGT96](https://github.com/SteveGT96)! - `@nxgt/openapi-msw` is a new package of MSW handlers for the operations `@nxgt/openapi-codegen` generates. `createOpenApiMsw(operations, { baseUrl })` binds the generated `operations` table, the same one `createOpenApiClient` takes, and infers every type from it.
  
  - **Handlers typed by their operation.** `mock.get('/items/{id}', resolver)` and `mock.op('getItem', resolver)` return MSW handlers for `setupServer` or `setupWorker`. Only the spec's methods and paths compile.
  - **The request as the server reads it.** The resolver receives `param`, `query` and `header` as the spec's validators output them, and the body as `json`, `form`, `text` or a binary `body`.
  - **The server's 400.** A request the spec refuses is answered with the 400 that `@nxgt/openapi-hono` sends, with the same issues. Answer it your own way with `onValidationError`.
  - **`reply(status, body)`.** The status comes first and types the body, so the editor offers the fields of the body declared for it. An undeclared status, or a body the spec does not declare, does not compile.
  - **Mocks that drift fail.** A reply that does not match the spec at runtime throws a `MockReplyError` naming its issues, so the test fails instead of passing on a mock the spec no longer backs.
