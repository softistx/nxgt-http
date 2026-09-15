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
For TanStack Query, [`@nxgt/httpyz-query`](https://www.npmjs.com/package/@nxgt/httpyz-query)
turns its calls into query options.

> **0.x.** The API is still settling.

## Install

```sh
bun add @nxgt/httpyz
```

- `typescript` 6: required peer, the version every `@nxgt` package pins.
- A Standard Schema library: optional, and not a peer. Bring your own if you
  declare replies.

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
| `fetch` | `globalThis.fetch`, looked up at each call | anything that takes a `Request` and returns a `Response`, or a promise of one: a Hono app's `app.fetch`, in tests |
| `headers` | none | sent with every request: an object, or a function run before each one |
| `init` | none | fetch options for every request: `credentials`, `mode`, `cache`… |
| `timeout` | none | milliseconds before a call fails with `TimeoutError` |
| `auth` | none | `{ token, refresh, scheme }`. See [Auth](#auth) |
| `retry` | never | a number of retries, `RetryOptions`, or `false`. See [Retries](#retries) |
| `use` | none | middleware around each request. See [Middleware](#middleware) |

## Subpaths

| Import | For |
| --- | --- |
| `@nxgt/httpyz` | the client, its types and its errors |
| `@nxgt/httpyz/integration` | for bindings such as `@nxgt/openapi-httpyz` only: the helpers that write and check requests exactly as the client does. An app has no use for it |

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
text and URL-encoded, and a `Date` as its ISO string. One missing at run
time throws a `TypeError` before anything is sent.

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
| `form` | an object of fields, a `FormData` or a `URLSearchParams` | fields: URL-encoded, or multipart once a field is a `Blob`; a list as a repeated field, any other object as JSON. A `FormData` is always multipart, a `URLSearchParams` always URL-encoded |
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
| `{ [mediaType]: schema \| null }` | a reply per media type. `null` reads it without a check: JSON parsed, as `unknown`; text as a `string`; a form as `FormData`; anything else as a `Blob` |

```ts
const csv = await http.get('/export', {
	responses: { 200: { 'text/csv': z.string() }, 204: null },
});
```

A status the call does not declare throws an `UndeclaredStatusError`, whose
`response` is still unread. Without `responses`, every reply is returned as
it came, typed `{ status: number; type: string | undefined; data: unknown }`,
and read by its media type: JSON parsed, text as a string, a form as
`FormData`, a reply with no `Content-Type` as text, anything else as a
`Blob`. A reply with no body, or an empty one, has `undefined` as `data`.

`unwrap` returns the data of the statuses it names, narrowed to theirs, and
throws a `ReplyStatusError` for any other reply. `ok` returns the data of
any 2xx reply, narrowed to the success statuses the call declares:

```ts
import { ok, unwrap } from '@nxgt/httpyz';

const responses = { 200: Employee, 404: Problem };
const employee = unwrap(await http.get('/employees/{id}', { param: { id }, responses }), 200);
const same = ok(await http.get('/employees/{id}', { param: { id }, responses }));
```

A reply's media type is matched to a declared one exactly, then by
`type/*`, then by `*/*`, then to the first declared type of the same kind.
So any JSON reply stands for a declared JSON type such as
`application/problem+json`, and a `text/plain` reply for a declared
`text/csv`.

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
`path`, a `code` and a `message`. The client's own issues have the codes
`invalid_json` and `invalid_content_type`. An issue from a validator without
codes has the code `custom`.

## Errors

| Error | When |
| --- | --- |
| `NetworkError` | fetch failed: no connection, a refused one, a CORS refusal; or a stream's connection dropped for good. `cause` is fetch's error |
| `TimeoutError` | no reply within `timeout`. `timeout` is the limit |
| `UndeclaredStatusError` | a status the call's `responses` do not declare, or a stream opened with any status but a 2xx or 204. `status`, and `response`, unread |
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
onLeave(() => page.cancel());

async function loadItems() {
	try {
		return await page.get('/items');
	} catch (error) {
		if (isAbortError(error)) return undefined; // cancelled: nothing to report
		throw error;
	}
}
```

- **`signal`** aborts with its reason: an `AbortError`, unless you gave it
  another.
- **`latest`** aborts the previous call with the same key, if it still
  runs, with an `AbortError`. Keys are per client. `send`, `events` and
  `lines` take it too: a stream it replaces ends with an `AbortError`.
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
- When `refresh` throws, or `token` then returns nothing or the same token,
  the 401 is the reply, for the app to sign out on.
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
ends early when the call times out or is aborted: `timeout` bounds the whole
call, its retries and their waits included.

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

`http.use()` adds middleware to a client you already have. It changes the
client in place, and returns it:

```ts
http.use(timing).use(logging);
```

- **After the chain the client has:** retry → auth → `use` → what `use()`
  added, in order → fetch.
- **From then on:** a call already sent keeps the chain it started with.
- **Groups:** a group runs through its parent's middleware, even what is
  added after the group was made. What is added to a group is the group's
  alone, and its own groups'.

Headers that only need a value, such as a `traceparent` from the current
span, need no middleware: `headers` may be a function.

### Caching

`cache()` is a middleware that keeps `ok` replies in memory. A request made
again while its reply is fresh is answered from memory, and `fetch` is never
called:

```ts
import { cache, createHttpClient } from '@nxgt/httpyz';

const replies = cache({ ttl: 30_000 });
createHttpClient({ baseUrl, auth, use: [replies] });
```

| Option | Default | |
| --- | --- | --- |
| `ttl` | 5 minutes | how long a reply stays fresh, in milliseconds |
| `maxEntries` | 500 | the least recently used reply goes first past it |
| `cacheable` | the reads: `GET`, `HEAD` and `QUERY` | `(request, call) => boolean`, which requests are cached |
| `vary` | `['authorization']` | the request headers that tell two replies apart |

- **The key** is the method, the URL, the `vary` headers and the body. A
  `QUERY` is cached by what it searches for, and, since the middleware runs
  inside `auth`, no caller is answered with another's reply.
- **One cache is one store.** Share the middleware between clients to share
  the store, as a server that makes a client per request does.
- **`replies.clear()` empties it,** after a write, say.
- It is in memory, per process: two instances of a service do not share it.

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
An event with no `event:` field is named `message`. Each event carries the
stream's last `id`, and `feed.lastEventId` holds it.

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
never reconnects. A 204 ends it, and any other status but a 2xx throws an
`UndeclaredStatusError`. It asks for `application/jsonl, application/x-ndjson`
and reads `application/jsonl`, `application/x-ndjson`, `application/ndjson`,
`application/jsonlines`, `application/x-jsonlines` and `application/json-seq`.

### Ending a stream

Both end on `close()`, on `break`, or on the call's `signal`, and the
connection closes with them. `close()` and `break` end the loop quietly, and
the `signal` throws its `AbortError`. `timeout` bounds the wait for the
headers of each connection, not the stream: a stream has no end to wait for.

`validate: false` and `decode: false` apply to each item as to a reply.
JSON that does not parse, an item its schema refuses, and a reply of
another media type throw a `ValidationError`. A stream is read once: a
second `for await` throws a `TypeError`.

## API

### `@nxgt/httpyz`

#### Functions

##### `createHttpClient`

```ts
function createHttpClient(options?: HttpClientOptions): HttpClient;
```

Makes a client. Every option is optional, and it throws nothing: the errors
come from its calls. See [Setup](#setup).

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `baseUrl` | `string \| URL` | none | where the API is served; a trailing `/` is dropped |
| `fetch` | `(request: Request) => Response \| Promise<Response>` | `globalThis.fetch`, looked up at each call | sends each request; it may answer at once, as `app.fetch` of Hono does |
| `headers` | `HeadersInit \| (() => HeadersInit \| Promise<HeadersInit>)` | none | sent with every request; a function runs before each one |
| `init` | `Omit<RequestInit, 'method' \| 'body' \| 'headers' \| 'signal'>` | none | fetch options for every request |
| `timeout` | `number` | none | milliseconds before a call fails with a `TimeoutError` |
| `auth` | `AuthOptions` | none | a token on every request, refreshed once on a 401 |
| `retry` | `number \| RetryOptions \| false` | never | sends a request again after a failure that may pass |
| `use` | `readonly Middleware[]` | none | around every request, the first outermost |

Returns an [`HttpClient`](#httpclient).

##### `isAbortError`

```ts
function isAbortError(error: unknown): boolean;
```

Whether `error` ended a call because it was aborted rather than failed: a
`DOMException` named `AbortError` or `TimeoutError`, or any `Error` named
`AbortError`. It is false for the client's own `TimeoutError`, and is a
plain `boolean`, not a type guard: as `error is Error`, the branch where it
is false would drop `Error` from the error's type, though a failure is an
`Error` too. See [Cancelling](#cancelling).

##### `unwrap`

```ts
function unwrap<
	R extends { readonly status: number; readonly data: unknown },
	S extends R['status'],
>(reply: R, ...statuses: [S, ...S[]]): Extract<R, { status: S }>['data'];
```

Returns `reply.data` when its status is one of `statuses`, at least one of
them, narrowed to theirs. Throws a `ReplyStatusError` for any other status.
See [Replies](#replies).

##### `ok`

```ts
function ok<R extends { readonly status: number; readonly data: unknown }>(
	reply: R,
): Success<R>['data'];
```

Returns `reply.data` for a status from 200 to 299, narrowed to the 2xx
members of the reply union. Throws a `ReplyStatusError` for any other. On a
reply that declares nothing, the data stays `unknown`. See
[Replies](#replies).

##### `cache`

```ts
function cache(options?: CacheOptions): Cache;
```

A middleware, for `use`, that keeps replies whose `response.ok` is true in
memory, and answers a request made again from a clone of its reply while it
is fresh. See [Caching](#caching).

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `ttl` | `number` | `300_000` (5 minutes) | milliseconds a reply stays fresh |
| `maxEntries` | `number` | `500` | the most replies kept; the least recently used goes first |
| `cacheable` | `(request: Request, call: CallContext) => boolean` | `GET`, `HEAD` and `QUERY` | which requests are cached |
| `vary` | `readonly string[]` | `['authorization']` | the request headers that tell two replies apart |

Returns a [`Cache`](#cache-1): the middleware, with `clear()`.

#### Classes

##### `ClientError`

```ts
class ClientError extends Error {
	constructor(context: CallContext, message: string, options?: ErrorOptions);
}
```

The base of every error a call throws, but an abort. Its message is
`message` after the call: `GET /employees/{id}: …`, or
`getEmployee (GET /employees/{id}): …` with an `operationId`. See
[Errors](#errors).

| Member | Type | Description |
| --- | --- | --- |
| `name` | `string` | `'ClientError'`, or the subclass's name |
| `method` | `string` | the call's method, lower case: `get` |
| `path` | `string` | as the caller wrote it, `/employees/{id}`; for `send`, the URL's pathname |
| `operationId` | `string \| undefined` | the call's name, when it was given one |
| `message` | `string` | the call, then what went wrong |
| `cause` | `unknown` | the error underneath, when there is one |

##### `NetworkError`

```ts
class NetworkError extends ClientError {
	constructor(context: CallContext, options?: ErrorOptions);
}
```

fetch threw, or a stream's connection dropped and was not reconnected. Its
message ends `no reply came back`, and `cause` is fetch's error. It is the
one error `retry` retries.

##### `TimeoutError`

```ts
class TimeoutError extends ClientError {
	constructor(context: CallContext, timeout: number, options?: ErrorOptions);
	readonly timeout: number;
}
```

No reply within the call's `timeout`, retries included; for a stream, no
headers within it on one connection. `timeout` is the limit in milliseconds,
and the message ends `no reply within 10000 ms`. `isAbortError` is false for
it.

##### `UndeclaredStatusError`

```ts
class UndeclaredStatusError extends ClientError {
	constructor(context: CallContext, response: Response);
	readonly status: number;
	readonly response: Response;
}
```

A status the call's `responses` do not declare, or a stream opened with any
status but a 2xx or 204. `response` is unread, its body still there to read.

##### `ValidationError`

```ts
class ValidationError extends ClientError {
	constructor(context: CallContext, failure: ValidationFailure);
	readonly failure: ValidationFailure;
}
```

A reply or stream item its declaration does not describe, or, from a
binding, a request refused before it was sent. Its message joins the issues'
messages with `; `. See [Validating and decoding](#validating-and-decoding).

##### `ReplyStatusError`

```ts
class ReplyStatusError extends Error {
	constructor(
		reply: { status: number; data: unknown; response?: Response },
		expected: readonly number[],
	);
}
```

From `unwrap()` or `ok()`: a reply with none of the statuses asked for. Its
message is `Expected a 200 or 204 reply, got 404`, or `Expected a 2xx reply,
got 404` when `expected` is empty. It extends `Error`, not `ClientError`.

| Member | Type | Description |
| --- | --- | --- |
| `name` | `string` | `'ReplyStatusError'` |
| `status` | `number` | the reply's status |
| `data` | `unknown` | the reply's data, already read |
| `response` | `Response \| undefined` | the reply's `Response`, when it had one |

#### Types

##### `HttpClient`

What `createHttpClient` returns.

| Member | Signature | Description |
| --- | --- | --- |
| `get`, `put`, `post`, `delete`, `options`, `head`, `patch`, `trace`, `query` | `Call` | a call with that method. See [Calls](#calls) |
| `request` | `(method: Method, path: Path, ...args: RequestArgs<Path, R, Decoded>) => Promise<HttpReply<R, Decoded>>` | a call with the method as a value |
| `send` | `(request: Request, options?: SendOptions) => Promise<Response>` | a `Request` of your own, its `Response` unread. See [A `Request` of your own](#a-request-of-your-own) |
| `events` | `(path: Path, ...args: EventsArgs<Path, E, Decoded>) => EventStream<StreamEvent<E, Decoded>>` | server-sent events. See [Server-sent events](#server-sent-events) |
| `lines` | `(path: Path, ...args: LinesArgs<Path, I, Decoded>) => Stream<StreamItem<I, Decoded>>` | JSON Lines. See [JSON Lines](#json-lines) |
| `group` | `() => HttpGroup` | the same client, for calls that end together. See [Cancelling](#cancelling) |
| `use` | `(...middlewares: Middleware[]) => this` | adds middleware to this client, in place, and returns it. See [Middleware](#middleware) |

##### `HttpGroup`

```ts
type HttpGroup = HttpClient & {
	cancel(reason?: unknown): void;
	readonly signal: AbortSignal;
};
```

What `http.group()` returns. `cancel()` aborts every call and stream of the
group still running; `signal` aborts on the next `cancel()`.

##### `HttpClientOptions`

The options of `createHttpClient`, in its [table](#createhttpclient).

##### `Method`

```ts
type Method = 'get' | 'put' | 'post' | 'delete' | 'options' | 'head' | 'patch' | 'trace' | 'query';
```

HTTP's methods, as OpenAPI lists them, and `query`. It names the client's
call methods and `RetryOptions.methods`.

##### `Call`

```ts
type Call = <Path extends string, R extends Responses | undefined = undefined, Decoded extends boolean = true>(
	path: Path,
	...args: RequestArgs<Path, R, Decoded>
) => Promise<HttpReply<R, Decoded>>;
```

The type of `http.get` and the other method calls.

##### `CallOptions`

What any call may add, on top of fetch's own options:
`Omit<RequestInit, 'method' | 'body' | 'headers'>`, `signal` included.

| Field | Type | Description |
| --- | --- | --- |
| `headers` | `HeadersInit` | over the client's `headers`; a `Content-Type` here wins over the body's own |
| `timeout` | `number` | this call's, instead of the client's |
| `retry` | `number \| RetryOptions \| false` | this call's, instead of the client's; `false` never retries |
| `operationId` | `string` | names the call in its errors and to middleware |
| `latest` | `string` | aborts the running call with the same key |

##### `ReplyOptions`

```ts
interface ReplyOptions<R extends Responses | undefined, Decoded extends boolean> {
	responses?: R;
	validate?: boolean; // default: true
	decode?: Decoded; // default: true
}
```

The reply options of a call. See [Validating and decoding](#validating-and-decoding).

##### `RequestOptions`

```ts
type RequestOptions<Path extends string, R extends Responses | undefined = undefined, Decoded extends boolean = true> =
	RequestInput<Path> & CallOptions & ReplyOptions<R, Decoded>;
```

Everything a call to `Path` takes, as its second argument.

##### `SendOptions`

| Field | Type | Description |
| --- | --- | --- |
| `timeout` | `number` | this request's, instead of the client's |
| `retry` | `number \| RetryOptions \| false` | this request's, instead of the client's |
| `operationId` | `string` | names the request in its errors and to middleware |
| `latest` | `string` | aborts the running request with the same key |

The options of `send`. Its signal is the `Request`'s own.

##### `ArgsFor`

Options for a call to `Path`: optional when the path has no `{name}`,
required when it does.

```ts
type A = ArgsFor<'/items/{id}', Options>; // [options: Options]
type B = ArgsFor<'/items', Options>; // [options?: Options]
```

##### `RequestArgs`

```ts
type RequestArgs<Path, R, Decoded> = ArgsFor<Path, RequestOptions<Path, R, Decoded>>;
```

The rest arguments of a call after its path.

##### `EventsArgs`

```ts
type EventsArgs<Path, E, Decoded> = ArgsFor<Path, RequestInput<Path> & EventsOptions<E, Decoded>>;
```

The rest arguments of `http.events()` after its path.

##### `LinesArgs`

```ts
type LinesArgs<Path, I, Decoded> = ArgsFor<Path, RequestInput<Path> & LinesOptions<I, Decoded>>;
```

The rest arguments of `http.lines()` after its path.

##### `RequestInput`

```ts
type RequestInput<Path extends string> = PathInput<Path> & BodyInput & { readonly query?: QueryInput };
```

What a call to `Path` sends: `param`, `query` and at most one body.

##### `PathInput`

`param`: required, with exactly the path's names, when it has any; else
absent.

```ts
type P = PathInput<'/items/{id}'>; // { readonly param: { readonly id: ParamValue } }
```

##### `PathParamNames`

The `{name}`s of a path, as a union.

```ts
type N = PathParamNames<'/items/{id}/notes/{noteId}'>; // 'id' | 'noteId'
```

##### `ParamValue`

```ts
type ParamValue = string | number | boolean | bigint | Date;
```

A path parameter or query value, written as text, a `Date` as its ISO
string.

##### `QueryValue`

```ts
type QueryValue = ParamValue | readonly ParamValue[] | null | undefined;
```

One query value: a list is a repeated key, `null` and `undefined` are left
out.

##### `QueryInput`

```ts
type QueryInput = { readonly [name: string]: QueryValue } | URLSearchParams;
```

A call's `query`. See [Query](#query).

##### `BodyInput`

```ts
type BodyInput =
	| { json: unknown }
	| { form: FormFields | FormData | URLSearchParams }
	| { text: string }
	| { body: Blob | ArrayBuffer | ArrayBufferView | ReadableStream }
	| {}; // simplified: the other three keys are `?: undefined` in each member
```

At most one body; two is a type error. See [Bodies](#bodies).

##### `FormFields`

```ts
type FormFields = { readonly [name: string]: unknown };
```

A `form` as an object: each value as text, a list as a repeated field, a
`Blob` as a file, any other object as JSON.

##### `Responses`

```ts
type Responses = { readonly [status: number]: Declared };
```

A call's `responses`: `{ 200: Employee, 404: Problem, 204: null }`.

##### `Declared`

```ts
type Declared = StandardSchemaV1 | null | { readonly [mediaType: string]: StandardSchemaV1 | null };
```

The reply of one status: a schema for JSON, `null` for no content, or a
schema per media type. See [Replies](#replies).

##### `HttpReply`

```ts
type HttpReply<R extends Responses | undefined, Decoded extends boolean = true> =
	WithResponse<R extends Responses ? ReplyOf<R, Decoded> : AnyReply>;
```

What a call resolves to.

##### `ReplyOf`

The declared replies as a union narrowed on `status`.

```ts
type R = ReplyOf<{ 200: typeof Employee; 204: null }>;
// { status: 200; type: string; data: Employee } | { status: 204; type: undefined; data: undefined }
```

With a media type map, `type` is that media type, and an unchecked `data` is
`string` for `text/*`, `FormData` for a form, `unknown` for JSON and `Blob`
for the rest. An empty map, `{}`, reads as `null` does: a reply without a
body.

##### `AnyReply`

```ts
interface AnyReply {
	readonly status: number;
	readonly type: string | undefined;
	readonly data: unknown;
}
```

The reply of a call without `responses`.

##### `WithResponse`

A reply with the `Response` it was read from, for its headers.

```ts
type W = WithResponse<AnyReply>; // AnyReply & { readonly response: Response }
```

##### `SchemaData`

A schema's output, or its input with `decode: false`; `never` for anything
but a schema.

```ts
type D = SchemaData<typeof Item, false>; // { createdAt: string }
```

##### `Success`

The members of a reply union with a 2xx status; all of it when its status
is any `number`. It types `ok()`.

```ts
type S = Success<{ status: 200; data: Employee } | { status: 404; data: Problem }>; // { status: 200; data: Employee }
```

##### `EventSchemas`

```ts
type EventSchemas = { readonly [event: string]: StandardSchemaV1 | null };
```

An events stream's `events`: a schema for JSON data, `null` for text.

##### `EventsOptions`

The options of `http.events()`, with `CallOptions` and the request's
`param`, `query` and body.

| Field | Type | Description |
| --- | --- | --- |
| `events` | `E extends EventSchemas` | the events, by name; without it, every event is yielded as it came |
| `onUnknownEvent` | `(event: ServerEvent) => void` | gets an event `events` does not declare |
| `reconnect` | `boolean \| ReconnectOptions` | default: on, but for POST and PATCH |
| `lastEventId` | `string` | sent as `Last-Event-ID` on the first connection |
| `method` | `Method` | default: `get` |
| `validate` | `boolean` | checks each event's data; default: `true` |
| `decode` | `boolean` | yields what each schema outputs; default: `true` |

##### `ReconnectOptions`

| Field | Type | Description |
| --- | --- | --- |
| `attempts` | `number` | reconnections in a row without an event before the stream gives up; default: no limit |
| `delay` | `number` | milliseconds before reconnecting, until the stream sends a `retry:`; default: `3000` |

The object form of `EventsOptions.reconnect`.

##### `LinesOptions`

The options of `http.lines()`, with `CallOptions` and the request's
`param`, `query` and body.

| Field | Type | Description |
| --- | --- | --- |
| `item` | `I extends StandardSchemaV1` | checks each line; without it, each is yielded parsed, as `unknown` |
| `method` | `Method` | default: `get` |
| `validate` | `boolean` | default: `true` |
| `decode` | `boolean` | default: `true` |

##### `Stream`

```ts
interface Stream<T> extends AsyncIterable<T> {
	close(): void;
}
```

What `http.lines()` returns: read once, with `for await`. `close()` ends
the loop and the connection.

##### `EventStream`

```ts
interface EventStream<T> extends Stream<T> {
	readonly lastEventId: string | undefined;
}
```

What `http.events()` returns; `lastEventId` is what a reconnection sends.

##### `StreamEvent`

An event of `http.events()`: a declared one narrowed on `event`, or a
`ServerEvent` when none is declared.

```ts
type E = StreamEvent<{ updated: typeof Item; ping: null }>;
// { event: 'updated'; data: Item; id: string | undefined } | { event: 'ping'; data: string; id: string | undefined }
```

##### `StreamItem`

A line of `http.lines()`, as its schema checks it; `unknown` without one.

```ts
type I = StreamItem<typeof Row>; // z.output<typeof Row>
```

##### `ServerEvent`

| Field | Type | Description |
| --- | --- | --- |
| `event` | `string` | its `event:` field, or `message` |
| `data` | `string` | its `data:` lines, joined with a line feed |
| `id` | `string \| undefined` | the last `id:` the stream set |

An event as the stream sent it: what `onUnknownEvent` gets, and what
`events` yields without `events` declared.

##### `Middleware`

```ts
type Middleware = (request: Request, next: Next, call: CallContext) => Promise<Response>;
```

An entry of `use`. See [Middleware](#middleware).

##### `Next`

```ts
type Next = (request: Request) => Promise<Response>;
```

The rest of the chain, as a middleware calls it.

##### `AuthOptions`

| Field | Type | Description |
| --- | --- | --- |
| `token` | `() => string \| null \| undefined \| Promise<string \| null \| undefined>` | the current token, read before each request; none sends no header |
| `refresh` | `() => unknown` | gets a new token after a 401, for `token` to return; optional |
| `scheme` | `string` | default: `Bearer` |

The client's `auth`. See [Auth](#auth).

##### `RetryOptions`

| Field | Type | Description |
| --- | --- | --- |
| `attempts` | `number` | tries after the first; default: `2`; `0` never retries |
| `methods` | `readonly Method[]` | default: every method but `post` and `patch` |
| `statuses` | `readonly number[]` | default: 408, 429, 502, 503, 504 |
| `delay` | `(attempt: number) => number` | milliseconds before retry `attempt`, from 1; default: random, up to 300 × 2^(attempt − 1) |
| `maxDelay` | `number` | the longest wait; a longer `Retry-After` is the reply; default: `10000` |

The object form of `retry`. See [Retries](#retries).

##### `Cache`

```ts
type Cache = Middleware & { clear(): void };
```

What `cache()` returns; `clear()` empties its store.

##### `CacheOptions`

The options of `cache()`, in its [table](#cache).

##### `CallContext`

```ts
interface CallContext {
	readonly method: string;
	readonly path: string; // as the caller wrote it: /employees/{id}
	readonly operationId?: string;
}
```

Which call it is: a middleware's third argument, and `cacheable`'s second.

##### `ValidationFailure`

```ts
interface ValidationFailure {
	kind: 'request' | 'response';
	operationId?: string;
	method: string;
	path: string;
	status?: number;
	issues: ValidationIssue[];
}
```

A `ValidationError`'s `failure`: one failure, every issue in it.

##### `ValidationIssue`

```ts
interface ValidationIssue {
	target: 'param' | 'query' | 'header' | 'json' | 'form' | 'body' | 'response';
	path: (string | number)[]; // [] for the whole target
	code: string;
	message: string;
}
```

One issue of a `ValidationFailure`; the client's own are on `response`.

##### `StandardSchemaV1`

```ts
interface StandardSchemaV1<Input = unknown, Output = Input> {
	readonly '~standard': {
		readonly version: 1;
		readonly vendor: string;
		readonly validate: (value: unknown) => StandardResult<Output> | Promise<StandardResult<Output>>;
		readonly types?: { readonly input: Input; readonly output: Output } | undefined;
	};
}
```

The part of [Standard Schema](https://standardschema.dev) the client calls:
any Zod 4, Valibot or ArkType schema fits it.

##### `StandardResult`

```ts
type StandardResult<Output> =
	| { readonly value: Output; readonly issues?: undefined }
	| { readonly issues: readonly StandardIssue[] };
```

What a schema's `validate` returns.

##### `StandardIssue`

```ts
interface StandardIssue {
	readonly message: string;
	readonly path?: readonly (PropertyKey | { readonly key: PropertyKey })[] | undefined;
}
```

One issue of a `StandardResult`.

##### `InferInput`

What a schema accepts.

```ts
type In = InferInput<typeof Item>; // { createdAt: string }
```

##### `InferOutput`

What a schema gives back.

```ts
type Out = InferOutput<typeof Item>; // { createdAt: Date }
```

### `@nxgt/httpyz/integration`

For bindings only: the pieces a binding reuses so that the requests it
writes and checks match the client's own.

#### Constants

##### `METHODS`

```ts
const METHODS: readonly Method[];
```

The nine methods, in order: `get`, `put`, `post`, `delete`, `options`,
`head`, `patch`, `trace`, `query`.

#### Functions

##### `text`

```ts
function text(value: unknown): string;
```

A value as the client writes it: a `Date` as its ISO string, anything else
through `String()`.

##### `absent`

```ts
function absent(value: unknown): value is undefined | null;
```

Whether the client leaves `value` out: `null` or `undefined`.

##### `fields`

```ts
function fields(form: FormFields): Generator<[string, string | Blob]>;
```

A form's fields as the client sends them: every item of a list, `null` and
`undefined` left out, a `Blob` as it is, any other object but a `Date` as
JSON, the rest through `text`.

##### `toFormData`

```ts
function toFormData(form: FormFields): FormData;
```

The `fields` of `form`, in a `FormData`.

##### `toSearchParams`

```ts
function toSearchParams(form: FormFields): URLSearchParams;
```

The `fields` of `form`, URL-encoded. Throws a `TypeError` when a field is a
`Blob`.

##### `check`

```ts
function check(schema: StandardSchemaV1, value: unknown, target: ValidationIssue['target']): Promise<Checked>;
```

Runs `value` through `schema`. Returns its output, or its issues on
`target`, their paths flattened to keys, and their `code` kept when it is a
string, else `custom`. It does not throw for a refused value.

#### Types

##### `Checked`

```ts
type Checked =
	| { readonly ok: true; readonly value: unknown }
	| { readonly ok: false; readonly issues: ValidationIssue[] };
```

What `check` resolves to.

## Traps

- **Outside a browser, set `baseUrl`.** A call builds a `Request`, which needs
  an absolute URL: without a `baseUrl`, Bun and Node throw a `TypeError`.
- **An abort is not a timeout.** Past `timeout`, a call throws
  `TimeoutError`. An abort through the call's own `signal`, `latest` or its
  group throws an `AbortError`, unwrapped, and is never retried: check it
  with `isAbortError()`, not `instanceof ClientError`.
- **`latest` keys are per client.** Two clients never share one, but a
  client and its groups do: a group's call with a key replaces the client's.
  Use distinct keys for calls that must not replace each other.
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
