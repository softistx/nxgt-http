---
'@nxgt/httpyz': patch
---

A `timeout` that fires while the reply body is still being read now rejects with httpyz's `TimeoutError` (with `timeout`, `method` and `path`, and the signal's `DOMException` as `cause`), as it does when it fires before the headers. It used to reject with the `DOMException` named `TimeoutError`, so `error instanceof TimeoutError` was false for a body that stalled. A caller's own abort during the body read still rejects with the `AbortError`, unchanged.
