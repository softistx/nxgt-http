# @alxia/core

An HTTP framework for [Bun](https://bun.sh), type-safe from the request to
the client that calls it, with **no dependency**. Each route declares what it
reads and what it answers with any [Standard Schema](https://standardschema.dev)
— Zod, Valibot, ArkType, or one written by hand — and the types follow: the
handler reads validated values, can only answer what it declared, and the
app's type is the contract [`@alxia/client`](https://www.npmjs.com/package/@alxia/client)
calls.

```sh
bun add @alxia/core
```

Everything else is a package of its own, to take or leave:
[`@alxia/zod`](https://www.npmjs.com/package/@alxia/zod),
[`@alxia/openapi`](https://www.npmjs.com/package/@alxia/openapi),
[`@alxia/graphql`](https://www.npmjs.com/package/@alxia/graphql),
[`@alxia/cors`](https://www.npmjs.com/package/@alxia/cors),
[`@alxia/secure-headers`](https://www.npmjs.com/package/@alxia/secure-headers),
[`@alxia/rate-limit`](https://www.npmjs.com/package/@alxia/rate-limit),
[`@alxia/compress`](https://www.npmjs.com/package/@alxia/compress),
[`@alxia/static`](https://www.npmjs.com/package/@alxia/static),
[`@alxia/jwt`](https://www.npmjs.com/package/@alxia/jwt),
[`@alxia/logger`](https://www.npmjs.com/package/@alxia/logger),
[`@alxia/env`](https://www.npmjs.com/package/@alxia/env).

## A first app

```ts
import { alxia } from '@alxia/core';
import { zq } from '@alxia/zod';
import { z } from 'zod';

const User = z.object({ id: z.number(), name: z.string() });

const app = alxia()
	.get(
		'/users/:id',
		{
			params: z.object({ id: zq.int() }),
			response: { 200: User, 404: z.object({ error: z.literal('not_found') }) },
		},
		async ({ params, reply }) => {
			const user = await findUser(params.id); // params.id: number
			return user ? reply(200, user) : reply(404, { error: 'not_found' });
		},
	)
	.post(
		'/users',
		{ body: z.object({ name: z.string().min(1) }), response: { 201: User } },
		async ({ body, reply }) => reply(201, await createUser(body.name)),
	);

app.listen(3000);

export type App = typeof app;
```

`listen` hands the routes to `Bun.serve`'s own router. `app.fetch` is the
same app as a fetch handler; `app.request('/users/1')` calls it in process.

## What the types refuse

Each of these is a compile error, not a runtime surprise:

```ts
app.get('/users/:id', { params: z.object({ name: z.string() }) }, ...); // not the path's parameters
app.get('/users', { quey: z.object({}) }, ...);                          // a typo
({ reply }) => reply(201, user);                                         // a status not declared
({ reply }) => reply(200, { id: '1' });                                  // a body its schema refuses
```

## Requests

| part | read from | without a schema |
| --- | --- | --- |
| `params` | the path, as strings | `{ id: string }`, from the path |
| `query` | the query string: a key given once is a string, more than once an array | `Record<string, string \| string[]>` |
| `headers` | the headers, names lowercased | `Record<string, string>` |
| `cookies` | the `Cookie` header | `Record<string, string>` |
| `body` | by `content-type`: a parser the app added, JSON, a form, text, or the bytes | `undefined`: read `ctx.request` |

A request any schema refuses is answered with a 400 that names every issue,
whatever part it is in:

```json
{ "error": "validation", "issues": [{ "target": "params", "path": ["id"], "code": "invalid_type", "message": "…" }] }
```

`ip` is the client's address — the `ip` option reads it behind a proxy —
and `server` the Bun server, when there is one. `HEAD` runs the `GET` route.

## Replies

A handler returns `reply(status, body, init?)`. With `response` schemas,
only a declared status, with a body its schema accepts. Without, any status
and any body — the client still reads the type of the body.

The body sent is the **output** of the schema: an unknown key it strips — a
password hash — never leaves the server. A reply its schema refuses is a
500, never an undeclared shape (`validateResponses: false` skips the check).

A string is `text/plain`, a `Blob` — a `Bun.file` — a stream or a buffer
goes as it is, an async iterable is a stream of server-sent events, anything
else is JSON. `redirect(location, status?)` needs no schema.
`set.headers` and `set.cookies` (a `Bun.CookieMap`) apply to every reply.

## Server-sent events

```ts
import { eventStream } from '@alxia/core';

app.get('/ticks', { response: { 200: eventStream(Tick) } }, ({ reply }) =>
	reply(200, (async function* () {
		for (let n = 0; ; n++) { yield { n }; await Bun.sleep(1000); }
	})()),
);
```

Each value is checked by the event's schema and sent as one `data:` line of
JSON; a comment keeps an idle stream open, and the generator is closed when
the client leaves. The client reads `data` as an `AsyncIterable` of events.

## WebSockets

```ts
app.ws('/rooms/:room', { message: Chat, send: Chat }, {
	open: (socket) => socket.subscribe(socket.data.params.room),
	message: (socket, chat) => socket.publish(socket.data.params.room, chat),
});
```

The upgrade request runs the hooks before the route and is validated as a
route's — a 401 or a 400 never becomes a socket. Each message is parsed as
JSON and checked by `message` (a refused one is answered with its issues,
the socket kept open); each one sent is checked by `send`. `socket.data`
holds the validated request and what each hook added. Sockets need
`listen`.

## Hooks

Route hooks apply to the routes declared **after** them: the chain reads in
the order the request runs.

```ts
const app = alxia()
	.decorate({ db })                                  // ctx.db, everywhere after
	.get('/health', ({ reply }) => reply(200, 'ok'))   // not guarded
	.derive(async ({ request, reply }) => {
		const user = await authenticate(request);
		return user ? { user } : reply(401, { error: 'unauthenticated' as const });
	})
	.get('/me', ({ user, reply }) => reply(200, user)); // ctx.user is typed
```

A reply a hook returns ends the request, and is added to the type of every
route after it: the client of `/me` reads the 401. `onError` turns a thrown
error into a reply the same way; an `HttpError` is answered as it says, and
anything else is a 500 that leaks nothing.

Global hooks apply to the whole app, wherever they are declared:

| hook | |
| --- | --- |
| `around(ctx, next)` | around everything else, the first declared outermost: `next()` resolves to the response, and what the hook awaits around it — a span, a transaction — holds for the whole request. `ctx.route` and `ctx.error` say what it reached and how it failed |
| `onRequest(ctx)` | before routing, every request; a `Response` it returns is sent as it is (a CORS preflight) |
| `onResponse(response, ctx)` | every response, 404s included; one it returns replaces it (headers, compression) |
| `onStart(server)`, `onStop()` | with `listen` and `stop` |
| `parser(type, parse)` | a body parser, tried before the built-in ones |

## Groups

```ts
app.group('/admin', (admin) =>
	admin.derive(requireAdmin).get('/stats', ...),   // the guard applies here only
);
```

A group's routes are under its prefix and keep the hooks declared before
it; the hooks it adds stay inside. `group(build)`, without a prefix, is a
scope alone.

## Plugins

A plugin is an app, or a function.

```ts
// an app: its routes, its context, its replies — all typed
const auth = alxia().derive(async ({ request }) => ({ user: await authenticate(request) }));
const users = alxia({ prefix: '/users' }).get('/:id', ...);

const app = alxia({ prefix: '/api' }).use(auth).use(users); // GET /api/users/:id

// a function: global hooks, the app's type unchanged
const poweredBy = (name: string): Plugin => (app) =>
	app.onResponse((response) => { response.headers.set('x-powered-by', name); });
```

`use(app)` mounts its routes under this app's prefix and behind this app's
hooks; its route hooks then apply to the routes declared after it, and its
global hooks become this app's.

## API

| export | |
| --- | --- |
| `alxia(options?)` | a new app: `prefix`, `validateResponses`, `ip` |
| `Alxia` | `get` `post` `put` `patch` `delete` `options` `head` `ws`, `decorate` `derive` `onError`, `around` `onRequest` `onResponse` `onStart` `onStop` `parser`, `group` `use`, `fetch` `request` `listen` `stop`, `routes` `sockets` `server` |
| `eventStream(schema)` | the response schema of a stream of events |
| `Reply`, `HttpError`, `ResponseValidationError` | what a handler returns or throws |
| `Plugin`, `AnyAlxia` | a function plugin, any app |
| `withHeaders`, `vary`, `check` | for plugins: edit a response's headers, add to `Vary`, run a schema |
| `RoutesOf<App>`, `Jsonify<T>` | the route table the client reads, and what a value is on the wire |
| `ContextOf<App>` | what a route declared next on `App` reads: to type a GraphQL schema, a service |
| `StandardSchemaV1`, `InferInput`, `InferOutput` | the Standard Schema types |
| `ValidationErrorBody`, `InternalErrorBody`, `RoutingErrorBody` | the bodies of the 400, 500, 404, 405 and 426 |
