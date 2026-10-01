# @alxia/secure-headers

Secure HTTP headers on every response of an
[alxia](https://www.npmjs.com/package/@alxia/core) app, 404s included, with
no dependency.

```sh
bun add @alxia/secure-headers
```

## Usage

```ts
import { secureHeaders } from '@alxia/secure-headers';

app.use(secureHeaders());
app.use(secureHeaders({ contentSecurityPolicy: "default-src 'self'", xFrameOptions: false }));
```

A header a route sets itself is kept: a page that needs its own policy sets
it on its reply.

## Defaults

| header | default | option |
| --- | --- | --- |
| `Content-Security-Policy` | `default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'` | `contentSecurityPolicy` |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | `strictTransportSecurity` |
| `X-Content-Type-Options` | `nosniff` | `xContentTypeOptions` |
| `X-Frame-Options` | `DENY` | `xFrameOptions` |
| `Referrer-Policy` | `no-referrer` | `referrerPolicy` |
| `Cross-Origin-Opener-Policy` | `same-origin` | `crossOriginOpenerPolicy` |
| `Cross-Origin-Resource-Policy` | `same-origin` | `crossOriginResourcePolicy` |
| `Cross-Origin-Embedder-Policy` | not sent | `crossOriginEmbedderPolicy` |
| `Origin-Agent-Cluster` | `?1` | `originAgentCluster` |
| `X-DNS-Prefetch-Control` | `off` | `xDnsPrefetchControl` |
| `X-Permitted-Cross-Domain-Policies` | `none` | `xPermittedCrossDomainPolicies` |
| `Permissions-Policy` | not sent | `permissionsPolicy` |

Each option takes a value, or `false` to leave the header out.
`X-Powered-By` and `Server` are removed unless `hidePoweredBy: false`.

## API

| export | |
| --- | --- |
| `secureHeaders(options?)` | the plugin |
| `SecureHeadersOptions` | its options |
