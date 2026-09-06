# @nxgt/datasource-rest

An Apollo-style REST datasource over `openapi-fetch`: auth forwarding, caching
and error translation, so a GraphQL resolver can call a REST service with the
same typed client the REST apps use.

Errors come back as `CustomException` from `@nxgt/shared-exceptions`, so a
downstream 404 surfaces as a `NotFound` rather than a transport failure.

## Install

```bash
bun add @nxgt/datasource-rest
```

Public on npmjs; no token needed to install. TypeScript is a peer, pinned to
`^6.0.3` across every `@nxgt/*` package — the set is unsatisfiable if one of
them widens it.
