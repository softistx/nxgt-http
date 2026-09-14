# nxgt-http

Typed HTTP, from both ends: a standalone `fetch` client, and an OpenAPI
generator whose output serves a spec with Hono and calls it with that client.

| Package | | |
| --- | --- | --- |
| [`@nxgt/httpyz`](packages/httpyz) | a typed HTTP client over the standard `fetch`: typed paths, replies checked with any Standard Schema, middleware, auth, retries. No spec needed | [npm](https://www.npmjs.com/package/@nxgt/httpyz) |
| [`@nxgt/openapi-codegen`](packages/openapi-codegen) | an OpenAPI 3.1/3.2 spec in, TypeScript types and Zod 4 schemas out, from one intermediate representation, so the two never disagree | [npm](https://www.npmjs.com/package/@nxgt/openapi-codegen) |
| [`@nxgt/openapi-hono`](packages/openapi-hono) | typed Hono routes for the generated operations, which validate the request, then call the handler | [npm](https://www.npmjs.com/package/@nxgt/openapi-hono) |
| [`@nxgt/openapi-httpyz`](packages/openapi-httpyz) | the generated operations, called through an `@nxgt/httpyz` client | [npm](https://www.npmjs.com/package/@nxgt/openapi-httpyz) |
| [`@nxgt/httpyz-query`](packages/httpyz-query) | TanStack Query options for an `@nxgt/httpyz` client's calls, which a cancelled query aborts | [npm](https://www.npmjs.com/package/@nxgt/httpyz-query) |
| [`@nxgt/datasource-rest`](packages/datasource-rest) | a REST service called from a GraphQL resolver through the bound client: the caller's token forwarded, reads cached, one error with a code | [npm](https://www.npmjs.com/package/@nxgt/datasource-rest) |

## How they fit

```
                openapi.yaml
                     │
            @nxgt/openapi-codegen
          ┌──────────┴──────────┐
     hono.ts               operations.ts, types.ts
          │                     │
 @nxgt/openapi-hono    @nxgt/openapi-httpyz ── @nxgt/httpyz ── @nxgt/httpyz-query
     (server)                (client)                (TanStack Query)
                              │
                     @nxgt/datasource-rest
                          (GraphQL)
```

The server and the client read the same generated schemas, so a request the
client's `validate` refuses is one the server would refuse, with the same
issues.

## Development

Bun 1.4.2.

```sh
bun install
bun run build        # first: packages resolve each other through dist/
bun run typecheck
bun run test
bun run verify:artifacts
./node_modules/.bin/biome check --write
```

A change under `packages/` needs a changeset (`bun changeset`). Merging to
`develop` opens a "Version packages" PR, and merging that PR publishes.
[AGENTS.md](AGENTS.md) explains why each of these steps exists.
