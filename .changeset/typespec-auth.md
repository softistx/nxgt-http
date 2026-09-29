---
'@nxgt/typespec': minor
---

Add authentication, as `@nxgt/janus` serves it: `JanusAuth` for `@useAuth`, which accepts `Authorization: Bearer` (`BearerAuth`), the `X-Session-Token` header (`SessionTokenAuth`) or the `janus-session` cookie (`SessionCookieAuth`), and the janus guards' replies without a body, `AuthenticationRequired` (401), `AccessDenied` (403) and `ErrorWithoutBody<Status>`.
