---
'@nxgt/openapi-httpyz': minor
---

Read an operation's stream with `api.stream(operationId, input, init)`.

For an operation whose reply the spec describes an item at a time (OpenAPI 3.2's `itemSchema`), `stream()` returns the client's server-sent events, each narrowed on its `event`, or its JSON lines. It writes the input as a call does and sends the stream's media type as `Accept`. `validate` checks the request on the first read, before anything is sent, and each item as it comes; `decode` yields what each schema outputs. An operation without a stream does not compile.
