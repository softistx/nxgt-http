---
'@nxgt/httpyz': minor
---

Cancel calls: `latest`, `http.group()` and `isAbortError()`.

- `latest: 'search'` on a call, a stream or a `send` aborts the call before it with the same key, if it still runs: typing ahead keeps one search in flight.
- `http.group()` returns the same client, whose calls, sends and streams all abort on `group.cancel(reason?)`. The group goes on after it, a group's groups are cancelled with it, and `group.signal` aborts on the next `cancel()`.
- `isAbortError(error)` tells an abort (a signal, `latest`, a group) from a failure, the client's own `TimeoutError` included.
- A call aborted while it waits for an auth refresh stops waiting; the refresh runs on for the others.

An abort still rejects with its reason, unwrapped: an `AbortError` unless the caller gave another.
