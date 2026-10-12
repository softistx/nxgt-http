---
'@nxgt/httpyz': patch
---

A connection that drops while a reply's body is read throws a `NetworkError` (`reply body cut off`) instead of the runtime's raw `TypeError`. It is not retried, since the reply came. A form that does not parse keeps `formData()`'s own error, and an abort stays as it is. `@nxgt/datasource-rest` maps it as it maps any `NetworkError`: a body cut off is now `SERVICE_UNAVAILABLE`, where the raw `TypeError` was `INTERNAL_SERVER_ERROR`.
