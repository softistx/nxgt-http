# @nxgt/httpyz

## 0.2.0

### Minor Changes

- [#26](https://github.com/softistx/nxgt-http/pull/26) [`a4d9cbc`](https://github.com/softistx/nxgt-http/commit/a4d9cbc3ac1dc30a9987b38811a1ec5ca45ed9e0) Thanks [@SteveGT96](https://github.com/SteveGT96)! - - **`@nxgt/httpyz`**:
    - The `fetch` option may return a `Response` at once, as well as a promise of one: `fetch: app.fetch` takes a Hono app as it is, with no `async` wrapper.
    - In `responses`, a status declared with an empty media map, `{}`, types as `null` does: a reply without a body, instead of `never`.
  - **`@nxgt/httpyz-query`**:
    - `queryKey()`'s input takes `header` and `decode: false`, as the keys already hold them, so a filter can name them.
    - In `./openapi`, `mutationOptions(method, path, init)` also takes a function of `mutate()`'s input that returns each call's init: its own `signal`, `latest` or headers.
    - `infiniteQueryOptions` throws at once for an operation the spec does not have, as `queryOptions` and `mutationOptions` do.
    - `./openapi` also exports `KeyInput`, `Paging`, `QueriesOptions`, `HttpQueryKey`, `HttpQueryOptions` and `HttpInfiniteQueryOptions`, and the new `MutationInit`.

### Patch Changes

- [#25](https://github.com/softistx/nxgt-http/pull/25) [`d2f70b5`](https://github.com/softistx/nxgt-http/commit/d2f70b56f728cc8770adf09199484f2914d2b6b6) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Licensed MIT: the package ships a LICENSE file. It was `UNLICENSED` before, which gave no one the right to use it.

## 0.1.0

### Minor Changes

- [#18](https://github.com/softistx/nxgt-http/pull/18) [`db77777`](https://github.com/softistx/nxgt-http/commit/db77777bca24768bbcfae9b1821d842d0350104f) Thanks [@SteveGT96](https://github.com/SteveGT96)! - `cache()`: a middleware that keeps `ok` replies in memory for `ttl`, and answers a request made again from memory.
  
  Its key is the method, the URL, the `vary` headers (`authorization` by default) and the body, so no caller is answered with another's reply, and a `QUERY` is cached by what it searches for. It holds at most `maxEntries` replies, the least recently used going first. `cacheable` chooses which requests are cached (the reads, `GET`, `HEAD` and `QUERY`, by default), and `clear()` empties it. Share the middleware to share its store.

- [#9](https://github.com/softistx/nxgt-http/pull/9) [`a0a4992`](https://github.com/softistx/nxgt-http/commit/a0a4992ce185dfbc870dac22386687476d9adb2a) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Cancel calls: `latest`, `http.group()` and `isAbortError()`.
  
  - `latest: 'search'` on a call, a stream or a `send` aborts the call before it with the same key, if it still runs: typing ahead keeps one search in flight.
  - `http.group()` returns the same client, whose calls, sends and streams all abort on `group.cancel(reason?)`. The group goes on after it, a group's groups are cancelled with it, and `group.signal` aborts on the next `cancel()`.
  - `isAbortError(error)` tells an abort (a signal, `latest`, a group) from a failure, the client's own `TimeoutError` included.
  - A call aborted while it waits for an auth refresh stops waiting; the refresh runs on for the others.
  
  An abort still rejects with its reason, unwrapped: an `AbortError` unless the caller gave another.

- [#12](https://github.com/softistx/nxgt-http/pull/12) [`8ac32ac`](https://github.com/softistx/nxgt-http/commit/8ac32ac6981583ed56734ce69b88fde803b14205) Thanks [@SteveGT96](https://github.com/SteveGT96)! - `ok(reply)` returns the data of any 2xx reply, narrowed to the success statuses the call declares, and throws a `ReplyStatusError` for any other. `Success<Reply>` is the type of those replies.

- [#4](https://github.com/softistx/nxgt-http/pull/4) [`71ced62`](https://github.com/softistx/nxgt-http/commit/71ced62c2bef0d75ca11e08b2fcde50355574526) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Streams. `http.events(path, { events: { update: Item, ping: null } })` reads server-sent events with `for await`, each narrowed on its `event` and its data checked by its schema as JSON (`null` keeps it as text). Undeclared events go to `onUnknownEvent`. It reconnects as `EventSource` does, sending `Last-Event-ID` and following the stream's `retry:`, but never after an error status or a 204, and not for POST or PATCH unless `reconnect` says so. `http.lines(path, { item: Row })` reads JSON Lines, NDJSON or JSON text sequences a record at a time. Both run each connection through `auth`, `retry` and middleware, bound `timeout` to the opening only, and stop on `close()`, `break` or the call's `signal`.

- [#1](https://github.com/softistx/nxgt-http/pull/1) [`eba5ec8`](https://github.com/softistx/nxgt-http/commit/eba5ec8b79a352d13731a33d5f11f4b005c66260) Thanks [@SteveGT96](https://github.com/SteveGT96)! - New package: a typed HTTP client over the standard `fetch`, with no runtime dependencies. `createHttpClient({ baseUrl })` gives `http.get(path, options)` for every method, QUERY included, `http.request(method, path, options)`, and `http.send(request)` for a `Request` of your own.
  
  A path's `{name}`s type its `param`. `query` writes a list as a repeated key, and a body is `json`, `form`, `text` or `body`, each sent with its own content type unless the call sets one. `responses: { 200: Item, 404: Problem, 204: null }` declares the replies with any Standard Schema: the call resolves to a union narrowed on `status`, each reply is checked (`validate: false` skips it), and `decode: false` returns what the schema was given. A status it does not declare throws `UndeclaredStatusError`, a failed fetch `NetworkError`, and a slow one `TimeoutError`. Without `responses`, a call returns any reply, read by its media type.
  
  `auth: { token, refresh }` sends an awaited bearer token, and on a 401 refreshes once for every call refused together, then sends each again. `retry` sends an idempotent request again after a network failure or a 408, 429, 502, 503 or 504, with backoff, honoring `Retry-After`. `use` takes middleware around each request.
  
  `@nxgt/httpyz/integration` exports what a binding such as `@nxgt/openapi-httpyz` builds on.

### Patch Changes

- [#24](https://github.com/softistx/nxgt-http/pull/24) [`7f8bef2`](https://github.com/softistx/nxgt-http/commit/7f8bef228fa4ce8803b750f6ddf6de0e3b5dbf99) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Each README now has an **API** section, after the usage sections, that documents every export: each function and method with its signature, options, return value and errors, each class with its members, and each type.
