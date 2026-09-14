---
'@nxgt/httpyz': minor
---

Streams. `http.events(path, { events: { update: Item, ping: null } })` reads server-sent events with `for await`, each narrowed on its `event` and its data checked by its schema as JSON (`null` keeps it as text). Undeclared events go to `onUnknownEvent`. It reconnects as `EventSource` does, sending `Last-Event-ID` and following the stream's `retry:`, but never after an error status or a 204, and not for POST or PATCH unless `reconnect` says so. `http.lines(path, { item: Row })` reads JSON Lines, NDJSON or JSON text sequences a record at a time. Both run each connection through `auth`, `retry` and middleware, bound `timeout` to the opening only, and stop on `close()`, `break` or the call's `signal`.
