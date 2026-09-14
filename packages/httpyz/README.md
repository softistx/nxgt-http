# @nxgt/openapi-client

A typed HTTP client for an OpenAPI spec, driven by what
[`@nxgt/openapi-codegen`](https://www.npmjs.com/package/@nxgt/openapi-codegen)
generates. It uses the standard `fetch` and has no runtime dependencies, so it
runs the same in a browser, in Bun and in Node.

Every call is checked against the spec at compile time: the path, the
parameters, the body, and each reply the operation declares. A reply is a
union narrowed on its status, so nothing throws for a status the spec
declares.

> **0.x.** The API is still settling. Middleware and retries, typed
> server-sent events and TanStack Query helpers are on the way.

## Install

```sh
bun add @nxgt/openapi-client
bun add -d @nxgt/openapi-codegen
```

The generated `operations.ts` imports `zod`, so the app needs it too.

## Setup

Generate the spec's files with `nxgt-openapi generate`, then:

```ts
import { createClient } from '@nxgt/openapi-client';
import { operations } from './generated/openapi/operations.js';
import type {
	ClientOperations,
	OperationsByRoute,
} from './generated/openapi/types.js';

export const api = createClient<ClientOperations, OperationsByRoute>(
	operations,
	{
		baseUrl: 'https://api.example.com',
		headers: async () => ({ authorization: `Bearer ${await token()}` }),
		timeout: 10_000,
	},
);
```

| Option | Default | |
| --- | --- | --- |
| `baseUrl` | none: relative URLs, which only a browser resolves | may carry a path prefix: `https://example.com/api` |
| `fetch` | `globalThis.fetch` | anything that takes a `Request` and returns a `Response`: `app.fetch` of a Hono app, in tests |
| `headers` | none | an object, or a function run before each call |
| `init` | none | fetch options for every call: `credentials`, `mode`… |
| `timeout` | none | milliseconds before a call fails with `TimeoutError` |
| `validate` | neither | `true`, or `{ request, response }`: check with the spec's schemas. See [Validating and decoding](#validating-and-decoding) |
| `decode` | `false` | `true` returns each reply as its schema outputs it |

## Calls

```ts
// By path, for any method, QUERY included
const reply = await api.get('/employees/{id}', { param: { id } });

// By operationId
await api.op('updateEmployee', { param: { id }, json: { name: 'Ada' } });

// fetch options, and a timeout, come last
await api.op('listEmployees', { query: { page: 2 } }, { signal, timeout: 2_000 });
```

The input holds each part of the request:

| Key | Holds | Written |
| --- | --- | --- |
| `param` | path parameters | encoded into the path |
| `query` | query parameters | a list as a repeated key, or joined with commas when the spec says `explode: false`; a `Date` as its ISO string |
| `header` | header parameters, keyed lowercased | a list joined with commas |
| `json` | a JSON body | `JSON.stringify` |
| `form` | a form body | multipart `FormData`, or URL-encoded when that is the declared type; a list as a repeated field |
| `text` | a text body | as it is |
| `body` | a binary body: `Blob`, `ArrayBuffer`, `Uint8Array` | as it is |

The input may be left out when nothing in it is required, and an operation
that takes nothing takes no input: `api.op('health')`.

## Replies

A call resolves to one of the replies the spec declares:

```ts
const reply = await api.get('/employees/{id}', { param: { id } });
reply.status; // 200 | 404
reply.type; // the declared media type: 'application/json'
reply.data; // Employee when status is 200, ErrorResponse when it is 404
reply.response; // the Response, for its headers: its body is read
```

`unwrap(reply, 200)` returns the data of a 200 and throws a
`ReplyStatusError` for any other reply.

A form reply's `data` is its `FormData`, and a binary one's a `Blob`.

## Validating and decoding

The types hold a call to the spec, but not the values in it: a `page` of `0`
where the spec says `minimum: 1`, or a reply from a server that drifted.
`validate` checks both with the schemas in the generated `operations` table:

- **The request**, before it is sent, by the validators the server runs, on
  what the server will read: each parameter as the text it travels as, the
  JSON as it parses, a form as its fields. A request the server would refuse
  throws a `ValidationError` with the same issues, and is never sent.
- **The reply**, before it is returned: a JSON or text reply against its
  schema, as `@nxgt/openapi-codegen/hono` checks its own with
  `validateResponses`.

The schemas are read through [Standard Schema](https://standardschema.dev)'s
`~standard`, so the client imports no validator: the generated table brings
Zod.

`decode` returns each reply as its schema outputs it, which differs from what
JSON carries once the spec is generated with `dates: 'date'`: a date-time is a
`Date`. That changes the replies' types, so a decoding client says so in its
third type argument, which then requires `decode: true`:

```ts
const api = createClient<ClientOperations, OperationsByRoute, true>(
	operations,
	{ baseUrl, decode: true },
);
const employee = unwrap(await api.get('/employees/{id}', { param: { id } }), 200);
employee.hiredAt; // Date
```

Decoding validates the reply, whatever `validate` says.

## Errors

| Error | When |
| --- | --- |
| `UndeclaredStatusError` | a status the operation does not declare: its `default` and `4XX` replies included. Its `response` is unread |
| `NetworkError` | fetch failed: no connection, a CORS refusal. `cause` is fetch's error |
| `TimeoutError` | no reply within `timeout` |
| `ValidationError` | a reply the spec does not describe: an undeclared media type, JSON that does not parse, and with `validate`, a value its schema refuses; or, with `validate`, a request the server would refuse. `failure` has the shape `@nxgt/openapi-codegen/hono` reports |

All four extend `ClientError`, which names the operation. An abort the caller
asked for through `signal` comes through as its own `AbortError`.

## Traps

- **Without `decode`, a reply is typed as JSON carries it**: with
  `dates: 'date'`, a date-time is a string. A request is written the same way
  in both cases: its date-times are strings, or a `Date` in a query or a
  header.
- **Give each operation its exact statuses.** A `default` or `4XX` reply is
  not in the types, so it throws `UndeclaredStatusError`.
