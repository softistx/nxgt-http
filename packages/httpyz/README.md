# @nxgt/httpyz

A typed HTTP client over the standard `fetch`. A call's path parameters are
typed from the path it names, and its replies from the schemas it declares.
A reply is a union narrowed on its status. Middleware, auth with a shared
token refresh, retries and timeouts come built in. It has no runtime
dependencies, so it runs the same in a browser, in Bun and in Node.

It needs no spec and no generated code: give it paths and any
[Standard Schema](https://standardschema.dev) (Zod, Valibot, ArkType…). For
a client driven by an OpenAPI spec, bind the generated operations onto it
with [`@nxgt/openapi-httpyz`](https://www.npmjs.com/package/@nxgt/openapi-httpyz).

> **0.x.** The API is still settling. TanStack Query helpers are on the way.

## Install

```sh
bun add @nxgt/httpyz
```

`typescript` 6 is its one peer, the version every `@nxgt` package pins. Bring
your own schema library if you declare replies.

## Setup

```ts
import { createHttpClient } from '@nxgt/httpyz';

export const http = createHttpClient({
	baseUrl: 'https://api.example.com',
	headers: async () => ({ 'x-request-id': crypto.randomUUID() }),
	timeout: 10_000,
	retry: 2,
});
```

| Option | Default | |
| --- | --- | --- |
| `baseUrl` | none: relative URLs, which only a browser resolves | may carry a path prefix: `https://example.com/api` |
| `fetch` | `globalThis.fetch`, looked up at each call | anything that takes a `Request` and returns a `Response`: a Hono app's `app.fetch`, in tests |
| `headers` | none | sent with every request: an object, or a function run before each one |
| `init` | none | fetch options for every request: `credentials`, `mode`, `cache`… |
| `timeout` | none | milliseconds before a call fails with `TimeoutError` |
| `auth` | none | `{ token, refresh, scheme }`. See [Auth](#auth) |
| `retry` | never | a number of retries, or `RetryOptions`. See [Retries](#retries) |
| `use` | none | middleware around each request. See [Middleware](#middleware) |

## Calls

There is a method per HTTP method, `query` included:
`get`, `put`, `post`, `delete`, `options`, `head`, `patch`, `trace` and
`query`. `request` takes the method as a value:

```ts
await http.get('/employees/{id}', { param: { id: 7 } });
await http.request('get', '/employees/{id}', { param: { id: 7 } });
```

### Path parameters

The path's `{name}`s are typed from the path itself. `param` is required,
with exactly those names, when the path has any. Each value is written as
text and URL-encoded, and a `Date` as its ISO string.

```ts
http.get('/teams/{team}/members/{id}', { param: { team: 'core', id: 7 } });
// @ts-expect-error id is missing
http.get('/teams/{team}/members/{id}', { param: { team: 'core' } });
```

### Query

```ts
http.get('/employees', {
	query: { page: 2, tag: ['a', 'b'], since: new Date(), skip: undefined },
});
// ?page=2&tag=a&tag=b&since=2024-05-01T10%3A00%3A00.000Z
```

A list is sent as a repeated key, and `null` and `undefined` are left out. A
`URLSearchParams` is sent as it is: pass one for any other style
(`ids=1,2`).

### Bodies

A call sends at most one body. Its kind sets the `Content-Type`:

| Key | Takes | Sent as |
| --- | --- | --- |
| `json` | any value | `JSON.stringify`, as `application/json` |
| `form` | an object of fields, a `FormData` or a `URLSearchParams` | URL-encoded, or multipart once a field is a `Blob`; a list as a repeated field, any other object as JSON |
| `text` | a string | `text/plain` |
| `body` | `Blob`, `ArrayBuffer`, a typed array or a `ReadableStream` | as it is: a `Blob`'s own type, else `application/octet-stream` |

A `Content-Type` in the call's own `headers` wins over the one for its kind,
for `json`, `text` and `body`:

```ts
http.patch('/employees/{id}', {
	param: { id },
	json: { name: 'Ada' },
	headers: { 'content-type': 'application/merge-patch+json' },
});
```

A `form` always lets fetch write its type, since a multipart one carries its
boundary. The client's shared `headers` never set a body's type.

### Per-call options

A call also takes every fetch option (`signal`, `cache`, `credentials`…),
and:

| Option | |
| --- | --- |
| `headers` | over the client's `headers` |
| `timeout` | this call's, instead of the client's |
| `retry` | this call's, instead of the client's: `false` never retries |
| `operationId` | names the call in its errors and to middleware |
| `latest` | a key: this call aborts the one before it with the same key. See [Cancelling](#cancelling) |

### A `Request` of your own

`send` takes a `Request` and returns its `Response` unread. The request goes
through the client's `retry`, `auth`, `use` and timeout, and the client's
`headers` are added to it; its own headers win.

```ts
const response = await http.send(new Request('https://api.example.com/export'), {
	timeout: 60_000,
});
```

## Replies

With `responses`, a call declares the replies it expects, by status:

```ts
import { z } from 'zod';

const Employee = z.object({ id: z.int(), name: z.string() });
const Problem = z.object({ title: z.string() });

const reply = await http.get('/employees/{id}', {
	param: { id },
	responses: { 200: Employee, 404: Problem },
});
if (reply.status === 404) throw new Error(reply.data.title);
reply.data.name; // string: status is 200 here
reply.type; // 'application/json'
reply.response.headers.get('etag'); // the Response, for its headers: its body is read
```

Each status takes:

| Declared | Means |
| --- | --- |
| a schema | a JSON reply, checked by the schema |
| `null` | no content: `type` and `data` are `undefined` |
| `{ [mediaType]: schema \| null }` | a reply per media type. `null` reads it without a check: text as a `string`, a form as `FormData`, anything else as a `Blob` |

```ts
const csv = await http.get('/export', {
	responses: { 200: { 'text/csv': z.string() }, 204: null },
});
```

A status the call does not declare throws an `UndeclaredStatusError`, whose
`response` is still unread. Without `responses`, every reply is returned as
it came, typed `{ status: number; type: string | undefined; data: unknown }`,
and read by its media type: JSON parsed, text as a string, a form as
`FormData`, anything else as a `Blob`.

`unwrap` returns the data of the statuses it names, narrowed to theirs, and
throws a `ReplyStatusError` for any other reply:

```ts
import { unwrap } from '@nxgt/httpyz';

const employee = unwrap(
	await http.get('/employees/{id}', { param: { id }, responses: { 200: Employee, 404: Problem } }),
	200,
);
```

`ok` returns the data of any 2xx reply, narrowed to the success statuses
the call declares, and throws a `ReplyStatusError` for any other:

```ts
const employee = ok(await http.get('/employees/{id}', { param: { id }, responses }));
```

A reply of `application/json` stands for a declared JSON type such as
`application/problem+json`, and a declared `text/*` or `*/*` for any type
it covers.

## Validating and decoding

A declared reply is checked with its schema, and returned as the schema
outputs it. Two call options change that:

| Option | Default | |
| --- | --- | --- |
| `validate` | `true` | `false` takes the reply at its word, unchecked |
| `decode` | `true` | `false` returns what the schema was given, rather than what it outputs |

```ts
const Item = z.object({
	createdAt: z.iso.datetime().transform((value) => new Date(value)),
});
const decoded = await http.get('/items/1', { responses: { 200: Item } });
decoded.data.createdAt; // Date
const wire = await http.get('/items/1', { responses: { 200: Item }, decode: false });
wire.data.createdAt; // string
```

Only JSON and text replies are checked. A reply that fails its schema, JSON
that does not parse, or a media type the status does not declare throws a
`ValidationError`. Its `failure` lists every issue, each with a `target`, a
`path`, a `code` and a `message`. An issue from a validator without codes
has the code `custom`.

## Errors

| Error | When |
| --- | --- |
| `NetworkError` | fetch failed: no connection, a refused one, a CORS refusal. `cause` is fetch's error |
| `TimeoutError` | no reply within `timeout`. `timeout` is the limit |
| `UndeclaredStatusError` | a status the call's `responses` do not declare. `status`, and `response`, unread |
| `ValidationError` | a reply its declaration does not describe; or, from a binding, a request refused before it was sent. `failure` has every issue |
| `ReplyStatusError` | from `unwrap()` or `ok()`: a reply with none of the statuses asked for. `status`, `data` and `response` |

The first four extend `ClientError`, whose message names the call,
`GET /employees/{id}: no reply came back`, or with its `operationId`,
`getEmployee (GET /employees/{id}): …`. It carries `method`, `path` and
`operationId`. `ReplyStatusError` extends `Error`.

An abort the caller asked for through `signal` is not wrapped: it comes
through as the `AbortError` its signal gave. `isAbortError(error)` tells it
from a failure.

## Cancelling

A call ends early in three ways, and each rejects with an abort, never a
`ClientError`:

```ts
import { isAbortError } from '@nxgt/httpyz';

// Its own signal
await http.get('/items', { signal: controller.signal });

// A later call with the same `latest` key: typing ahead keeps one search in flight
await http.get('/search', { query: { q }, latest: 'search' });

// Its group's cancel(): every call of a page, a component, a job
const page = http.group();
await page.get('/items');
page.cancel(); // on leaving the page

try {
	await page.get('/items');
} catch (error) {
	if (isAbortError(error)) return; // cancelled: nothing to report
	throw error;
}
```

- **`signal`** aborts with its reason: an `AbortError`, unless you gave it
  another.
- **`latest`** aborts the previous call with the same key, if it still
  runs, with an `AbortError`. Keys are per client. `send` takes it too.
- **`http.group()`** returns the same client, whose calls also end on
  `group.cancel(reason?)`: every call, `send` and stream made through it
  that still runs aborts, with `reason` or an `AbortError`. The group goes
  on: a call made after `cancel()` runs. A group's `group()` is cancelled
  with it, but not the reverse. `group.signal` aborts on the next
  `cancel()`, for work of your own that ends with the group's calls.

An abort is never retried, and ends a retry's wait, a stream's reconnection
and, for that call alone, the wait for an [auth](#auth) refresh.

`isAbortError(error)` is true for an `AbortError`, and for the
`TimeoutError` of an `AbortSignal.timeout()` you passed as `signal`. The
client's own `TimeoutError`, past `timeout`, is a failure: it is false for
it.

## Auth

```ts
createHttpClient({
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
- A call aborted while it waits stops waiting, and rejects with its abort;
  the refresh runs on for the others.

`scheme` replaces `Bearer`. Without `refresh`, a 401 is simply the reply.

## Retries

```ts
const http = createHttpClient({ baseUrl, retry: 2 });
await http.put('/items/{id}', { param: { id }, json: item, retry: false }); // or per call
```

A retry sends the request again, body included, after a failure that may
pass:

- no reply at all, a `NetworkError`;
- a 408, 429, 502, 503 or 504.

Only a method that may be repeated is retried, which is every method but
POST and PATCH: a POST that got no reply may still have been carried out.

The wait before each retry is random, up to 300 ms doubled at each retry. A
reply's `Retry-After`, in seconds or as a date, wins over it. A `Retry-After`
longer than `maxDelay` is not waited for: that reply is the reply. The wait
ends early when the call times out or is aborted.

| `RetryOptions` | Default |
| --- | --- |
| `attempts` | 2: tries after the first |
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
import { createHttpClient, type Middleware } from '@nxgt/httpyz';

const timing: Middleware = async (request, next, call) => {
	const start = performance.now();
	try {
		return await next(request);
	} finally {
		metrics.record(call.operationId ?? call.path, performance.now() - start);
	}
};
createHttpClient({ baseUrl, use: [timing] });
```

`call` is the call's `{ method, path, operationId }`, with the path as the
caller wrote it: `/employees/{id}`.

The layers nest as retry → auth → `use` → fetch. The first in `use` is the
outermost, and all of them run inside `retry` and `auth`, so they see each
try, with its token. A middleware's own error comes through as it is, and is
not retried.

Headers that only need a value, such as a `traceparent` from the current
span, need no middleware: `headers` may be a function.

## Streams

### Server-sent events

`events` reads a `text/event-stream` with `for await`. It connects when the
loop starts, and each event is narrowed on its `event`:

```ts
const feed = http.events('/items/{id}/events', {
	param: { id },
	events: { updated: Item, removed: z.object({ id: z.int() }), ping: null },
	onUnknownEvent: (event) => console.warn('unknown event', event.event),
});
for await (const event of feed) {
	if (event.event === 'updated') render(event.data); // Item
	if (event.event === 'removed') drop(event.data.id);
}
```

| Declared | The event's `data` |
| --- | --- |
| a schema | parsed as JSON, checked, and decoded, as a reply is |
| `null` | the text as it came |
| no `events` at all | every event yielded as `{ event, data, id }`, its data as text |

An event `events` does not declare is not yielded: `onUnknownEvent` gets it.
Each event carries the stream's last `id`, and `feed.lastEventId` holds it.

It reconnects as `EventSource` does: when the connection drops or the
stream ends, it waits, then connects again with `Last-Event-ID`. The wait is
3 seconds until the stream sends a `retry:`.

- It never reconnects after an error status, which throws an
  `UndeclaredStatusError`, nor after a 204, which ends the stream. A server
  ends a stream for good with a 204.
- It does not reconnect a POST or a PATCH, unless `reconnect` says so.
- `reconnect: false` never reconnects. `{ attempts, delay }` gives up after
  `attempts` reconnections in a row without an event, and waits `delay`
  until a `retry:`.
- `lastEventId` resumes a stream from an ID of your own.

Each connection is a request of its own: its `headers` run again, and it
goes through `retry`, `auth` and `use`, so a refreshed token is sent.

### JSON Lines

`lines` reads a stream of JSON texts a record at a time: JSON Lines, NDJSON
or a JSON text sequence. `item` checks each one:

```ts
for await (const row of http.lines('/export', { item: Row })) save(row);
```

A blank line is skipped, and the last record needs no line end. `lines`
never reconnects.

### Ending a stream

Both end on `close()`, on `break`, or on the call's `signal`, and the
connection closes with them. `close()` and `break` end the loop quietly, and
the `signal` throws its `AbortError`. `timeout` bounds the wait for the
headers of each connection, not the stream: a stream has no end to wait for.

`validate: false` and `decode: false` apply to each item as to a reply.
JSON that does not parse, an item its schema refuses, and a reply of
another media type throw a `ValidationError`.

## Subpaths

| Import | For |
| --- | --- |
| `@nxgt/httpyz` | the client, its types and its errors |
| `@nxgt/httpyz/integration` | for bindings such as `@nxgt/openapi-httpyz` only: the helpers that write and check requests exactly as the client does. An app has no use for it |

## Traps

- **Outside a browser, set `baseUrl`.** A call builds a `Request`, which needs
  an absolute URL: without a `baseUrl`, Bun and Node throw a `TypeError`.
- **An abort is not a timeout.** Past `timeout`, a call throws
  `TimeoutError`. An abort through the call's own `signal`, `latest` or its
  group throws an `AbortError`, unwrapped, and is never retried: check it
  with `isAbortError()`, not `instanceof ClientError`.
- **`latest` keys are per client.** Two clients, or a client and one of
  its groups, share them: a group's call with a key replaces the client's.
- **`decode: false` changes the types.** A reply is then typed as what the
  schema takes, `z.input`, not what it gives, `z.output`: a date-time is a
  string.
- **`validate: false` keeps the types.** The reply is still typed by its
  schema, but nothing checked it.
- **Bun adds a charset to text `Blob`s.** A `Blob` of `text/html` has the
  type `text/html;charset=utf-8` in Bun, and that is the `Content-Type` a
  `body` of it is sent with.
- **Declare the statuses you handle.** With `responses`, any other status
  throws, a 500 included. Leave `responses` out to get every reply back.
- **A finite event stream reconnects.** A GET stream that simply ends is
  read again, as `EventSource` would. End it with a 204 from the server,
  `close()` it, or pass `reconnect: false`.
