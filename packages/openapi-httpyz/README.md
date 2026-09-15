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
bun add -d @nxgt/openapi-codegen typescript
```

Both peers are required: `@nxgt/httpyz`, since the binding uses your client,
not a copy of its own, and `typescript` 6, for the types. The generated
`operations.ts` imports `zod`, so the app needs it too.

## Setup

Generate the spec's files, into `generated/openapi` unless `-o` says
otherwise:

```sh
bunx nxgt-openapi generate -i openapi.yaml
```

Then bind them:

```ts
import { createHttpClient } from '@nxgt/httpyz';
import { createOpenApiClient } from '@nxgt/openapi-httpyz';
import { operations } from './generated/openapi/operations.js';

const http = createHttpClient({
	baseUrl: 'https://api.example.com',
	timeout: 10_000,
});

export const api = createOpenApiClient(http, operations);
```

`operations`, the runtime table of the generated `operations.ts`, holds each
parameter's location and style, the body's media types, each reply's schema,
and the server's validators. Its type also carries each operation's input and
replies, `ClientOperations` of the generated `types.ts`, so the client is
typed from the table alone:

- `api.get` offers the paths that have a GET operation, and takes what the
  operation at the chosen path takes.
- The client has only the methods the spec has an operation for: no `trace`
  on a spec without a TRACE operation, in its types or at runtime.

The types may also be given, as a table generated before
`@nxgt/openapi-codegen` carried them requires:
`createOpenApiClient<ClientOperations, OperationsByRoute>(http, operations)`.
`OperationsByRoute` may be left out: it is worked out of `ClientOperations`.

The client keeps that table as `api.operations`, for a package built over it,
such as [`@nxgt/httpyz-query/openapi`](https://www.npmjs.com/package/@nxgt/httpyz-query).

The client's options are the client's own: see
[`@nxgt/httpyz`](https://www.npmjs.com/package/@nxgt/httpyz#setup). The
binding's, `validate` and `decode`, are listed under
[`createOpenApiClient`](#createopenapiclient).

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

Both are checked by default, as a plain call of the client checks a declared
reply. Turn off what you do not want:

```ts
createOpenApiClient(http, operations, { validate: { request: false } }); // the reply only
createOpenApiClient(http, operations, { validate: false, decode: false }); // nothing
```

`decode`, also on by default, returns each reply as its schema outputs it,
which differs from what JSON carries once the spec is generated with
`dates: 'date'`: a date-time is a `Date`. The client's replies are typed so:

```ts
const api = createOpenApiClient(http, operations);
const employee = unwrap(await api.get('/employees/{id}', { param: { id } }), 200);
employee.hiredAt; // Date
```

Decoding validates the reply, whatever `validate` says. `decode: false`
returns each reply, and types it, as JSON carries it. With the types given,
a third type argument says the client does not decode:
`createOpenApiClient<ClientOperations, OperationsByRoute, false>`, which does
not compile without `decode: false`.

## API

The examples below use a spec with `getEmployee` at `GET /employees/{id}`,
`listEmployees` at `GET /employees`, `createEmployee` at `POST /employees`,
and `watchFeed`, an event stream, at `GET /feed`.

### Functions

#### createOpenApiClient

```ts
// With decode: false, the replies are typed as JSON carries them
function createOpenApiClient<Ops extends OperationsShape<Ops>, Routes = RoutesOf<Ops>>(
	http: HttpClient,
	operations: OperationTable<Ops>,
	options: OpenApiOptions & { readonly decode: false },
): OpenApiClient<Ops, Routes, false>;

function createOpenApiClient<
	Ops extends OperationsShape<Ops>,
	Routes = RoutesOf<Ops>,
	Decoded extends boolean = true,
>(
	http: HttpClient,
	operations: OperationTable<Ops>,
	...options: OpenApiArgs<Decoded>
): OpenApiClient<Ops, Routes, Decoded>;
```

Binds the generated `operations` table onto `http`, a client of
`createHttpClient()` or one of its groups. `Ops` is inferred from the table;
`Routes` defaults to `RoutesOf<Ops>`; `Decoded` is `false` when
`decode: false` is passed, and `true` otherwise. See [Setup](#setup) and [Validating and decoding](#validating-and-decoding).

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `validate` | `boolean \| { request?: boolean; response?: boolean }` | both | Checks with the spec's schemas, throwing a `ValidationError`: the request before it is sent, the reply before it is returned. `true` is both, `false` neither |
| `decode` | `true \| false` | `true` | Returns each reply as its schema outputs it, and types it so, validating it whatever `validate` says. `false` returns it as JSON carries it. A literal: a `boolean` variable does not compile, since the replies' type depends on it |

Returns an [`OpenApiClient`](#openapiclient). It throws nothing itself: an
unknown `operationId` fails the call made with it, and a path with no
operation for its method rejects with a `ClientError`,
`GET /x: the spec has no operation at it`.

### The client

#### op

```ts
api.op<K extends keyof Ops & string>(id: K, ...args: Args<Ops, K>): Promise<WithResponse<OperationReply<Ops, K, Decoded>>>;
```

Calls an operation by its `operationId`, with its input, if it takes one,
then an [`OperationInit`](#operationinit). See [Calls](#calls).

Resolves to one of the declared replies, `{ status, type, data, response }`,
as in [Replies](#replies). Rejects with a `ValidationError` when `validate`
refuses the request or the reply, with the client's errors, such as
`UndeclaredStatusError`, and with an `Error` for an `operationId` the table
does not have.

#### Path methods

```ts
api.get<P extends PathsOf<Routes, 'get'>>(path: P, ...args: Args<Ops, IdOf<Ops, Routes, 'get', P>>): Promise<WithResponse<OperationReply<Ops, IdOf<Ops, Routes, 'get', P>, Decoded>>>;
// and put, post, delete, options, head, patch, trace, query: each the spec has an operation for
```

Calls the operation at a method and a path, as the spec writes it:
`api.get('/employees/{id}', { param: { id } })`. The client types only the
methods in [`MethodsOf<Routes>`](#methodsof), each taking only its
[`PathsOf`](#pathsof). The arguments, reply and errors are those of
[`op`](#op); a path with no operation for the method rejects with an `Error`.

#### stream

```ts
api.stream<K extends StreamIds<Ops>>(id: K, ...args: StreamArgs<Ops, K>): OperationStreamOf<Ops, K, Decoded>;
```

Reads an operation's stream by its `operationId`, an item at a time: an
`EventStream` of events narrowed on `event`, or a `Stream` of JSON lines. It
takes the input, then a [`StreamInit`](#streaminit). See [Streams](#streams).

It connects when read, and `close()` ends it. It throws an `Error`, where it
is called, for an operation without a stream. A `ValidationError` from
`validate`, or a client error, is thrown where the stream is read.

#### group

```ts
api.group(): OpenApiGroup<Ops, Routes, Decoded>;
```

The same client, with the same options, over the client's `http.group()`:
its calls and streams also end on its `cancel()`. See [Cancelling](#cancelling).

#### group.cancel

```ts
page.cancel(reason?: unknown): void;
```

Aborts every call and stream of the group still running, with `reason`, or
an `AbortError`. The group goes on: the calls made after it run.

#### group.signal

```ts
readonly page.signal: AbortSignal;
```

Aborts on the next `cancel()`: for work of your own that ends with the
group's calls. It is a new signal after each `cancel()`.

#### operations

```ts
readonly api.operations: OperationTable<Ops>;
```

The generated `operations` table the client was bound to, for a package
built over it that reads the spec as the client does, such as
[`@nxgt/httpyz-query/openapi`](https://www.npmjs.com/package/@nxgt/httpyz-query).

### Types

#### OpenApiClient

```ts
type OpenApiClient<Ops extends OperationsShape<Ops>, Routes = RoutesOf<Ops>, Decoded extends boolean = false> = {
	op: …; // see op
	stream: …; // see stream
	group(): OpenApiGroup<Ops, Routes, Decoded>;
	readonly operations: OperationTable<Ops>;
} & PathMethods<Ops, Routes, Decoded>;
```

What `createOpenApiClient()` returns: the members are under
[The client](#the-client).

#### OpenApiGroup

```ts
type OpenApiGroup<Ops, Routes = RoutesOf<Ops>, Decoded extends boolean = false> =
	OpenApiClient<Ops, Routes, Decoded> & {
		cancel(reason?: unknown): void;
		readonly signal: AbortSignal;
	};
```

What [`group()`](#group) returns: the client, with
[`cancel`](#groupcancel) and [`signal`](#groupsignal).

#### PathMethods

```ts
type PathMethods<Ops, Routes = RoutesOf<Ops>, Decoded extends boolean = false> = {
	readonly [M in MethodsOf<Routes>]: <P extends PathsOf<Routes, M>>(
		path: P,
		...args: Args<Ops, IdOf<Ops, Routes, M, P>>
	) => Promise<WithResponse<OperationReply<Ops, IdOf<Ops, Routes, M, P>, Decoded>>>;
};
```

The [path methods](#path-methods) alone, for a package that offers them on an
object of its own, as [`@nxgt/datasource-rest`](https://www.npmjs.com/package/@nxgt/datasource-rest)
does. `PathMethods<ClientOperations>` has `get` and `post` on the example spec.

#### OpenApiOptions

| Field | Type | Description |
| --- | --- | --- |
| `validate` | `boolean \| { readonly request?: boolean; readonly response?: boolean }` | Checks the request, the reply, both (`true`) or neither (`false`). Default: both |

The options of [`createOpenApiClient`](#createopenapiclient), beside `decode`.

#### OpenApiArgs

```ts
type OpenApiArgs<Decoded extends boolean> = Decoded extends false
	? [options: OpenApiOptions & { readonly decode: false }]
	: [options?: OpenApiOptions & { readonly decode?: true }];
```

The options argument of `createOpenApiClient()`, required with
`decode: false` when `Decoded` is `false`. `OpenApiArgs<true>` resolves to
`[options?: OpenApiOptions & { readonly decode?: true }]`.

#### OperationInit

```ts
type OperationInit = Omit<CallOptions, 'operationId'>;
```

What a call takes after its input: the client's call options, the binding
naming the call itself.

| Field | Type | Description |
| --- | --- | --- |
| `headers` | `HeadersInit` | Over the client's `headers`; a `Content-Type` here gives way to the one a JSON, text or binary body sets |
| `timeout` | `number` | This call's timeout, instead of the client's |
| `retry` | `number \| RetryOptions \| false` | This call's retry, instead of the client's: `false` never retries |
| `latest` | `string` | Aborts the call before it with the same key, if it still runs |
| `signal`, `cache`, `credentials`, … | as in `RequestInit` | fetch's own options, but `method`, `body` and `headers` |

#### StreamInit

```ts
interface StreamInit extends OperationInit {
	reconnect?: boolean | ReconnectOptions;
	lastEventId?: string;
	onUnknownEvent?: (event: ServerEvent) => void;
}
```

What [`stream()`](#stream) takes after its input.

| Field | Type | Description |
| --- | --- | --- |
| `reconnect` | `boolean \| ReconnectOptions` | Events only: connects again when the connection drops or the stream ends, as `EventSource` does. Default: on, but for POST and PATCH |
| `lastEventId` | `string` | Events only: sent as `Last-Event-ID` on the first connection |
| `onUnknownEvent` | `(event: ServerEvent) => void` | Events only: an event the spec does not declare, which is not yielded |

#### Args

A call's arguments after the `operationId` or the path: the operation's own,
then an `OperationInit`.
`Args<ClientOperations, 'getEmployee'>` resolves to
`[input: { param: { id: number } }, init?: OperationInit]`.

#### StreamArgs

A stream's arguments after the `operationId`: the operation's own, then a
`StreamInit`.
`StreamArgs<ClientOperations, 'watchFeed'>` resolves to
`[input: { query: { topic: string } }, init?: StreamInit]`.

#### OperationReply

An operation's replies, decoded or as JSON carries them, as `op()` and the
path methods resolve to them without `response`.
`OperationReply<ClientOperations, 'getEmployee', false>` resolves to
`ClientOperations['getEmployee']['wire']`, and with `true` to its `reply`.

#### OperationStreamOf

What [`stream()`](#stream) returns: an `EventStream` for server-sent events, a
`Stream` for JSON lines, of items decoded or as JSON carries them.
`OperationStreamOf<ClientOperations, 'watchFeed', false>` resolves to
`EventStream<ClientOperations['watchFeed']['stream']['wire']>`.

#### StreamIds

The operations that reply with a stream: the only ones `stream()` accepts.
`StreamIds<ClientOperations>` resolves to `'watchFeed'`.

#### RoutesOf

`OperationsByRoute`, worked out of `ClientOperations`: each `'method path'`
to its `operationId`, and the default of `Routes`.
`RoutesOf<ClientOperations>['get /employees/{id}']` resolves to `'getEmployee'`.

#### MethodsOf

The methods the spec has an operation for: the only path methods a client
offers. `MethodsOf<RoutesOf<ClientOperations>>` resolves to `'get' | 'post'`.

#### PathsOf

The paths with an operation for a method.
`PathsOf<RoutesOf<ClientOperations>, 'get'>` resolves to
`'/employees' | '/employees/{id}' | '/feed'`.

#### IdOf

The `operationId` of the operation at a method and a path.
`IdOf<ClientOperations, RoutesOf<ClientOperations>, 'get', '/employees/{id}'>`
resolves to `'getEmployee'`.

#### OperationsShape

```ts
type OperationsShape<Ops> = { [K in keyof Ops]: ClientOperation };
```

The constraint on `Ops`: the generated `ClientOperations`, an entry per
`operationId`.

#### ClientOperation

| Field | Type | Description |
| --- | --- | --- |
| `method` | `Method` | The operation's method, lowercased |
| `path` | `string` | The path as the spec writes it |
| `args` | `readonly unknown[]` | What a call takes after the `operationId`: `[input]`, `[input?]` or `[]` |
| `reply` | `unknown` | Every declared reply, `{ status; type; data }`, decoded |
| `wire` | `unknown` | The same replies as JSON carries them |
| `stream` | `OperationStream`, optional | A reply read an item at a time, when the operation has one |

What the binding reads of an entry of the generated `ClientOperations`.

#### OperationStream

| Field | Type | Description |
| --- | --- | --- |
| `kind` | `'sse' \| 'jsonl'` | Server-sent events, or JSON lines |
| `item` | `unknown` | Each item, decoded: an event narrowed on `event`, or a line |
| `wire` | `unknown` | Each item as JSON carries it |

The `stream` of a `ClientOperation`.

#### OperationTable

```ts
type OperationTable<Ops> = {
	readonly [K in keyof Ops]: RuntimeOperation & { readonly '~client'?: Ops[K] };
};
```

The type of the generated `operations` table, and of `api.operations`. Each
entry carries its `ClientOperations` entry as `'~client'`, a type that is
never set, which is how `createOpenApiClient(http, operations)` infers `Ops`.

#### RuntimeOperation

| Field | Type | Description |
| --- | --- | --- |
| `method` | `Method` | The operation's method |
| `path` | `string` | As the spec writes it: `/employees/{id}` |
| `parameters` | `readonly RuntimeParameter[]` | How each parameter is written |
| `param`, `query`, `header` | `StandardSchemaV1`, optional | The server's validators of each location, which read text: for `validate` |
| `body` | `{ required: boolean; content: { [mediaType]: RuntimeMedia } }`, optional | The request body's media types |
| `responses` | `{ [status]: { [mediaType]: RuntimeMedia } }` | Each declared reply's media types |

What the binding reads of an entry of the `operations` table.

#### RuntimeParameter

| Field | Type | Description |
| --- | --- | --- |
| `name` | `string` | As the spec writes it |
| `in` | `'path' \| 'query' \| 'header'` | Where it goes |
| `required` | `boolean` | Whether the spec requires it |
| `explode` | `boolean` | A query list as `?a=1&a=2` (`true`) or `?a=1,2` (`false`) |
| `list` | `boolean` | Whether it is validated as a list |

An entry of a `RuntimeOperation`'s `parameters`.

#### RuntimeMedia

| Field | Type | Description |
| --- | --- | --- |
| `kind` | `'json' \| 'form' \| 'text' \| 'binary' \| 'sse' \| 'jsonl'` | How the content is read or written |
| `schema` | `StandardSchemaV1`, optional | The content's schema; absent for binary content and a stream |
| `events` | `{ [event]: StandardSchemaV1 \| null }`, optional | `sse`: each event's data, by name: a schema for JSON, `null` for text |
| `item` | `StandardSchemaV1`, optional | `jsonl`: each item |

A media type of a `RuntimeOperation`'s `body` or `responses`.

## Traps

- **Decoding returns what the schema outputs**, and it is on by default: keys
  the spec does not declare are dropped, unless the spec was generated to
  keep them, and a reply the spec refuses throws a `ValidationError`, even
  with `validate: false`. `decode: false` takes the reply at its word.
- **An error reply is checked too.** A 400 declared with a schema that does
  not describe what the server sends, such as the validation body of
  `@nxgt/openapi-hono`, `{ status, message, timestamp, issues }`, throws a
  `ValidationError` instead of returning the 400. Declare the body the server
  sends, or pass `decode: false` and `validate: { response: false }`.
- **With `decode: false`, a reply is typed as JSON carries it**: with
  `dates: 'date'`, a date-time is a string.
- **A request is typed as JSON carries it, whatever `decode` says.** With
  `dates: 'date'`, a date-time in a body or a query is still typed as a
  string: pass `date.toISOString()`.
- **Give each operation its exact statuses.** A `default` or `4XX` reply is
  not generated, so it throws `UndeclaredStatusError`.
- **A stream's request is refused where the stream is read**, not where
  `stream()` is called: put the `try` around the `for await`.
- **The client's `baseUrl` is still required outside a browser**, and its
  options, `auth`, `retry` and `use` included, apply to every call the
  binding makes.
