---
'@nxgt/openapi-codegen': minor
'@nxgt/openapi-hono': patch
'@nxgt/openapi-httpyz': patch
---

Describe streamed replies an item at a time, from OpenAPI 3.2's `itemSchema`.

A 2xx reply of server-sent events (`text/event-stream`) or JSON Lines (`application/jsonl`, `application/x-ndjson`, `application/json-seq`) now gives its operation a `stream` in `ClientOperations` and `Operations`:

- for events, a union narrowed on `event`, each event's `data` typed by its `contentSchema` when it is JSON (`contentMediaType: application/json`), and as text otherwise; an event sent without a name is a `message`;
- for JSON Lines, the type of each line.

In `operations.ts`, such a reply is `{ kind: 'sse', events: { update: zItem, ping: null } }` or `{ kind: 'jsonl', item: zItem }`: a validator per event name, or per line. `@nxgt/openapi-hono` and `@nxgt/openapi-httpyz` accept these tables.

A `text/event-stream` reply was typed `text` before, and a JSON Lines one `binary`: their `kind` in `operations.ts` changes accordingly.
