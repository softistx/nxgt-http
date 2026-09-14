# @nxgt/openapi-client

A typed HTTP client for an OpenAPI spec, driven by what
[`@nxgt/openapi-codegen`](https://www.npmjs.com/package/@nxgt/openapi-codegen)
generates. It uses the standard `fetch` and has no runtime dependencies, so it
runs the same in a browser, in Bun and in Node.

Every call is checked against the spec at compile time: the path, the
parameters, the body, and each reply the operation declares. A reply is a
union narrowed on its status, so nothing throws for a status the spec
declares.

> **0.x.** The API is still settling. Typed server-sent events and TanStack
> Query helpers are on the way.

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
| `auth` | none | `{ token, refresh }`. See [Auth](#auth) |
| `retry` | never | a number of retries, or `RetryOptions`. See [Retries](#retries) |
| `use` | none | middleware around each request. See [Middleware](#middleware) |

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

## Auth

```ts
createClient<ClientOperations, OperationsByRoute>(operations, {
	baseUrl,
	auth: {
		token: () => session.accessToken,
		refresh: () => session.refresh(),
	},
});
```

`token` is read, and awaited, before each request, and sent as
`Authorization: Bearer <token>`; none sends no header. On a 401, `refresh`
runs, and the request is sent again once, body included, with the token
`token` then returns:

- Calls refused together share one refresh.
- A call refused with a token that has since been replaced is sent again
  without another refresh.
- When `refresh` throws, or leaves the same token, the 401 is the reply, for
  the app to sign out on.

`scheme` replaces `Bearer`.

## Retries

```ts
createClient<ClientOperations, OperationsByRoute>(operations, { baseUrl, retry: 2 });
await api.op('createInvoice', input, { retry: false }); // or per call
```

A retry sends the request again, body included, after a failure that may
pass:

- no reply at all, a `NetworkError`;
- a 408, 429, 502, 503 or 504.

Only a method that may be repeated is retried, which is every method but
POST and PATCH: a POST that got no reply may still have been carried out.

The wait before each retry is random, up to 300 ms doubled at each retry. A
reply's `Retry-After`, in seconds or as a date, wins over it. A `Retry-After`
longer than `maxDelay` (10 s) is not waited for: that reply is the reply. The
wait ends early when the call times out or is aborted.

| `RetryOptions` | Default |
| --- | --- |
| `attempts` | 2 |
| `methods` | every method but `post` and `patch` |
| `statuses` | 408, 429, 502, 503, 504 |
| `delay(attempt)` | random, up to 300 ms × 2^(attempt − 1) |
| `maxDelay` | 10 000 |

Retries are off by default. In a browser, TanStack Query already retries.
Turn them on for server-to-server calls.

## Middleware

A middleware runs around each request. It can change the request or the
response, or answer on its own, in which case `fetch` is never called:

```ts
const timing: Middleware = async (request, next, call) => {
	const start = performance.now();
	try {
		return await next(request);
	} finally {
		metrics.record(call.operationId, performance.now() - start);
	}
};
createClient<ClientOperations, OperationsByRoute>(operations, { baseUrl, use: [timing] });
```

The first in `use` is the outermost. All of them run inside `retry` and
`auth`, so they see each try, with its token.

A middleware's own error comes through as it is, and is not retried. Headers
that only need a value, such as a `traceparent` from the current span, need
no middleware: `headers` may be a function.

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
