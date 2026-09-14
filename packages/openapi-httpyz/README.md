# @nxgt/openapi-httpyz

Binds the operations [`@nxgt/openapi-codegen`](https://www.npmjs.com/package/@nxgt/openapi-codegen)
generates from an OpenAPI spec onto a client of
[`@nxgt/httpyz`](https://www.npmjs.com/package/@nxgt/httpyz). Every call is
checked against the spec at compile time: the path, the parameters, the body
and each reply the operation declares. A reply is a union narrowed on its
status, so nothing throws for a status the spec declares.

The client sends, with its middleware, auth, retries and timeouts. The
binding adds what the spec knows: how each parameter and body is written,
the replies each operation declares, and checks by the server's own
validators.

> **0.x.** The API is still settling.

## Install

```sh
bun add @nxgt/httpyz @nxgt/openapi-httpyz zod
bun add -d @nxgt/openapi-codegen
```

`@nxgt/httpyz` is a peer: the binding uses your client, not a copy of its
own. The generated `operations.ts` imports `zod`, so the app needs it too.

## Setup

Generate the spec's files with `nxgt-openapi generate`, then bind them:

```ts
import { createHttpClient } from '@nxgt/httpyz';
import { createOpenApiClient } from '@nxgt/openapi-httpyz';
import { operations } from './generated/openapi/operations.js';
import type {
	ClientOperations,
	OperationsByRoute,
} from './generated/openapi/types.js';

const http = createHttpClient({
	baseUrl: 'https://api.example.com',
	timeout: 10_000,
});

export const api = createOpenApiClient<ClientOperations, OperationsByRoute>(
	http,
	operations,
);
```

It reads two generated files:

| File | What the binding takes |
| --- | --- |
| `types.ts` | `ClientOperations`, each operation's input and replies, and `OperationsByRoute`, which maps `'get /employees/{id}'` to its `operationId` |
| `operations.ts` | `operations`, the runtime table: each parameter's location and style, the body's media types, each reply's schema, and the server's validators |

The client's options are the client's own: see
[`@nxgt/httpyz`](https://www.npmjs.com/package/@nxgt/httpyz#setup). The
binding's are:

| Option | Default | |
| --- | --- | --- |
| `validate` | neither | `true`, or `{ request, response }`: check with the spec's validators. See [Validating and decoding](#validating-and-decoding) |
| `decode` | `false` | `true` returns each reply as its schema outputs it |

## Calls

```ts
// By method and path, QUERY included
const reply = await api.get('/employees/{id}', { param: { id } });

// By operationId
await api.op('updateEmployee', { param: { id }, json: { name: 'Ada' } });

// fetch options, a timeout or a retry come last
await api.op('listEmployees', { query: { page: 2 } }, { signal, timeout: 2_000 });
```

A path the spec has no operation for, for that method, does not compile.
The input holds each part of the request, as `ClientOperations` types it:

| Key | Holds | Written |
| --- | --- | --- |
| `param` | path parameters | encoded into the path |
| `query` | query parameters | a list as a repeated key, or joined with commas when the spec says `explode: false` |
| `header` | header parameters, by lowercased name | a list joined with commas |
| `json` | a JSON body | `JSON.stringify`, as the JSON type the spec declares |
| `form` | a form body | URL-encoded when that is the declared type, else multipart `FormData`; a list as a repeated field |
| `text` | a text body | as it is, as the text type the spec declares |
| `body` | a binary body: `Blob`, `ArrayBuffer`, `Uint8Array` | as it is, as the binary type the spec declares |

The input may be left out when nothing in it is required, and an operation
that takes nothing takes no input: `api.op('health')`, or
`api.op('health', { signal })`.

## Cancelling

A call's init takes the client's own ways to end it early: its `signal`,
and `latest`, a key that aborts the call before it with the same key.
`api.group()` is the same client over the client's `http.group()`, whose
calls and streams end together:

```ts
// Typing ahead: only the last search stays in flight
await api.get('/employees', { query: { name } }, { latest: 'search' });

const page = api.group();
const employees = await page.op('listEmployees');
page.cancel(); // on leaving the page: its calls and streams still running abort
```

A cancelled call rejects with an `AbortError`, never a `ClientError`: tell
it from a failure with the client's `isAbortError()`. The group goes on
after `cancel()`, and `page.signal` aborts on the next one. The details are
in [the client's README](https://www.npmjs.com/package/@nxgt/httpyz#cancelling).

## Replies

A call resolves to one of the replies the spec declares:

```ts
import { unwrap } from '@nxgt/httpyz';

const reply = await api.get('/employees/{id}', { param: { id } });
reply.status; // 200 | 404
reply.type; // the declared media type: 'application/json'
reply.data; // Employee when status is 200, ErrorResponse when it is 404
reply.response; // the Response, for its headers: its body is read

const employee = unwrap(reply, 200); // or a ReplyStatusError
```

A form reply's `data` is its `FormData`, and a binary one's a `Blob`. A
status the spec does not declare for the operation throws the client's
`UndeclaredStatusError`; errors are the client's own, listed in
[its README](https://www.npmjs.com/package/@nxgt/httpyz#errors).

## Streams

An operation whose reply the spec describes an item at a time, with OpenAPI
3.2's `itemSchema`, is read with `stream()`, by its `operationId`. Server-sent
events come through the client's `events()`, each narrowed on its name, and
JSON Lines through its `lines()`:

```ts
const feed = api.stream('watchFeed', { query: { topic: 'news' } });
for await (const event of feed) {
	if (event.event === 'added') event.data.name; // Item
	else event.data; // 'note': text
}

for await (const item of api.stream('exportItems', { json: { limit: 100 } })) {
	item.id;
}
```

- It connects when read, and `close()` or a `break` ends it. Events
  reconnect as `EventSource` does, but for POST and PATCH; the init after the
  input takes `reconnect`, `lastEventId` and `onUnknownEvent`, beside the call
  options.
- It sends the stream's declared media type as `Accept`, and writes the input
  as a call does.
- `validate` checks the request on the first read, before anything is sent,
  and each item against its schema; `decode` yields what each schema
  outputs.
- Only an operation with a stream is accepted; the others do not compile.

An event the spec does not declare is not yielded: it goes to
`onUnknownEvent`. The stream API is the client's, described in
[its README](https://www.npmjs.com/package/@nxgt/httpyz#streams).

## Validating and decoding

The types hold a call to the spec, but not the values in it: a `page` of `0`
where the spec says `minimum: 1`, or a reply from a server that drifted.
`validate` checks both with the schemas in the generated `operations` table:

- **The request**, before it is sent, by the validators the server runs, on
  what the server will read: each parameter as the text it travels as, the
  JSON as it parses, a form as its fields. A request the server would refuse
  throws a `ValidationError` with the same issues, and is never sent.
- **The reply**, before it is returned: a JSON or text reply against its
  schema, as [`@nxgt/openapi-hono`](https://www.npmjs.com/package/@nxgt/openapi-hono)
  checks its own with `validateResponses`.

```ts
createOpenApiClient<ClientOperations, OperationsByRoute>(http, operations, {
	validate: { request: true },
});
```

Unlike a plain call of the client, which checks a declared reply by default,
the binding checks nothing by default: the types already hold both ends to
the spec.

`decode` returns each reply as its schema outputs it, which differs from what
JSON carries once the spec is generated with `dates: 'date'`: a date-time is
a `Date`. That changes the replies' types, so a decoding client says so in
its third type argument, which then requires `decode: true`:

```ts
const api = createOpenApiClient<ClientOperations, OperationsByRoute, true>(
	http,
	operations,
	{ decode: true },
);
const employee = unwrap(await api.get('/employees/{id}', { param: { id } }), 200);
employee.hiredAt; // Date
```

`decode: true` without the `true` type argument, or the `true` type argument
without `decode: true`, does not compile. Decoding validates the reply,
whatever `validate` says.

## Traps

- **Without `decode`, a reply is typed as JSON carries it**: with
  `dates: 'date'`, a date-time is a string.
- **A request is typed as JSON carries it, whatever `decode` says.** With
  `dates: 'date'`, a date-time in a body or a query is still typed as a
  string: pass `date.toISOString()`.
- **Give each operation its exact statuses.** A `default` or `4XX` reply is
  not in the types, so it throws `UndeclaredStatusError`.
- **Leave `OperationsByRoute` out, and only `op()` is typed.** The calls by
  path look an operation up by its route in that map.
- **The client's `baseUrl` is still required outside a browser**, and its
  options, `auth`, `retry` and `use` included, apply to every call the
  binding makes.
