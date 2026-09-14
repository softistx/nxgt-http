---
'@nxgt/httpyz': minor
---

New package: a typed HTTP client over the standard `fetch`, with no runtime dependencies. `createHttpClient({ baseUrl })` gives `http.get(path, options)` for every method, QUERY included, `http.request(method, path, options)`, and `http.send(request)` for a `Request` of your own.

A path's `{name}`s type its `param`. `query` writes a list as a repeated key, and a body is `json`, `form`, `text` or `body`, each sent with its own content type unless the call sets one. `responses: { 200: Item, 404: Problem, 204: null }` declares the replies with any Standard Schema: the call resolves to a union narrowed on `status`, each reply is checked (`validate: false` skips it), and `decode: false` returns what the schema was given. A status it does not declare throws `UndeclaredStatusError`, a failed fetch `NetworkError`, and a slow one `TimeoutError`. Without `responses`, a call returns any reply, read by its media type.

`auth: { token, refresh }` sends an awaited bearer token, and on a 401 refreshes once for every call refused together, then sends each again. `retry` sends an idempotent request again after a network failure or a 408, 429, 502, 503 or 504, with backoff, honoring `Retry-After`. `use` takes middleware around each request.

`@nxgt/httpyz/integration` exports what a binding such as `@nxgt/openapi-httpyz` builds on.
