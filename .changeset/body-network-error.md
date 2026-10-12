---
'@nxgt/httpyz': patch
---

A connection that drops while a reply's body is read throws a `NetworkError` (`reply body cut off`) instead of the runtime's raw `TypeError`. It is not retried, since the reply came. A form that does not parse keeps `formData()`'s own error, and an abort stays as it is.
