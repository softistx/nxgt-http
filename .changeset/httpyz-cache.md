---
'@nxgt/httpyz': minor
---

`cache()`: a middleware that keeps `ok` replies in memory for `ttl`, and answers a request made again from memory.

Its key is the method, the URL, the `vary` headers (`authorization` by default) and the body, so no caller is answered with another's reply, and a `QUERY` is cached by what it searches for. It holds at most `maxEntries` replies, the least recently used going first. `cacheable` chooses which requests are cached (the reads, `GET`, `HEAD` and `QUERY`, by default), and `clear()` empties it. Share the middleware to share its store.
