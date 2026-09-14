---
'@nxgt/openapi-httpyz': minor
---

Cancel a bound client's calls together with `api.group()`.

`api.group()` is the same client over the core client's `http.group()`: its calls and streams also end on `cancel(reason?)`, and `signal` aborts on the next `cancel()`. A call's init already takes the client's `signal` and `latest`, which aborts the call before it with the same key.
