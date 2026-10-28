---
'@nxgt/httpyz': minor
---

Add an `onOpen` option to `http.events()` and `http.lines()`, called with the reply of each connection once it is accepted (a 2xx but 204), before any item is read, and again after each reconnection. It is not called for a refused reply, and an error it throws is logged without ending the stream.
