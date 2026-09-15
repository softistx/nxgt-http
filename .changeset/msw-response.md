---
'@nxgt/openapi-msw': minor
---

Breaking: `reply(status, body)` is replaced by `response`, still typed by
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
