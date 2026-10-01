# @alxia/client

The typed client of an [`@alxia/core`](https://www.npmjs.com/package/@alxia/core)
app, from the app's type alone: no spec, no code generation. Every path,
parameter, query, header and body is checked as you write the call, and the
result is a union by status, so checking `status` tells you what `data` is.

```sh
bun add @alxia/client
```

## Calling an app

```ts
import { client } from '@alxia/client';
import type { App } from './server'; // a type import: no server code in the bundle

const api = client<App>('http://localhost:3000');

const result = await api.get('/users/:id', { params: { id: 1 } });
if (result.status === 200) {
	result.data.name; // string
} else if (result.status === 404) {
	result.data.error; // 'not_found'
}
```

`data` is typed as it crosses the wire: a `Date` the server sends is a
`string` here. Every call may also read the 500 any route may answer, and
the 400 of a route that validates its request. `ok` is `true` for a 2xx and
narrows the same way.

## Testing without a server

Given the app itself, the client calls its `fetch` in process:

```ts
const api = client(app);
const created = await api.post('/users', { body: { name: 'Ada' } });
expect(created.status).toBe(201);
```

## Server-sent events

A route that streams events resolves to an async iterable, typed by the
event's schema:

```ts
const ticks = await api.get('/ticks');
if (ticks.status === 200) {
	for await (const tick of ticks.data) console.log(tick.n);
}
```

## WebSockets

```ts
const socket = api.ws('/rooms/:room', { params: { room: 'lobby' } });
socket.send({ text: 'hi' });                    // typed by the route's `message`
socket.on((chat) => console.log(chat.text));    // typed by its `send`
for await (const chat of socket) { ... }        // or as an async iterable
socket.close();
```

Messages are JSON both ways; a send before the socket opens is queued. A
socket needs a server: give the client its URL.

## Options

```ts
const api = client<App>('https://api.example.com', {
	headers: async () => ({ authorization: `Bearer ${await token()}` }),
	fetch: myFetch,
});

await api.get('/users/:id', { params: { id: 1 }, signal, init: { cache: 'no-store' } });
await api.get('/me', { cookies: { session } }); // when the route types its cookies
```

A query or header value that is a `Date` is sent in ISO 8601, an object as
JSON.

## API

| export | |
| --- | --- |
| `client<App>(target, options?)` | the client of an app: a base URL, or anything with a `fetch(request)` |
| `fillPath(path, params)` | a path with its parameters encoded in |
| `readEvents(body)` | a `text/event-stream` body as the values of its events |
| `TypedSocket<Send, Receive>` | what `api.ws()` returns |
| `Client<App>` | the client's type: one method per HTTP method the app answers |
| `CallResult<Output>` | what a call resolves to: `status`, `ok`, `data`, `response` |
