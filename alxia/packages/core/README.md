# @alxia/core

An HTTP framework for [Bun](https://bun.sh), type-safe from the request to
the client that calls it. Each route declares what it reads and what it
answers with any [Standard Schema](https://standardschema.dev) — Zod 4 first,
Valibot and ArkType alike — and the types follow: the handler reads validated
values, can only answer what it declared, and the app's type is the contract
`@alxia/client` calls.

```sh
bun add @alxia/core zod
```

## A first app

```ts
import { alxia } from '@alxia/core';
import { z } from 'zod';

const User = z.object({ id: z.number(), name: z.string() });

const app = alxia()
	.get(
		'/users/:id',
		{
			params: z.object({ id: z.coerce.number().int() }),
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
same app as a plain fetch handler, for a test or another runtime.

## What the types refuse

Each of these is a compile error, not a runtime surprise:

```ts
// the params schema must read the parameters the path declares
app.get('/users/:id', { params: z.object({ name: z.string() }) }, ...);

// a typo in the route
app.get('/users', { quey: z.object({}) }, ...);

// a status the route does not declare, or a body its schema refuses
({ reply }) => reply(201, user);
({ reply }) => reply(200, { id: '1' });
```

## Requests

| part | read from | without a schema |
| --- | --- | --- |
| `params` | the path, as strings: `z.coerce.number()` | `{ id: string }`, from the path |
| `query` | the query string: a key given once is a string, more than once an array | `Record<string, string \| string[]>` |
| `headers` | the headers, names lowercased | `Record<string, string>` |
| `body` | JSON, a form, or text, by `content-type` | `undefined`: read `ctx.request` |

A request any schema refuses is answered with a 400 that names every issue,
whatever part it is in:

```json
{ "error": "validation", "issues": [{ "target": "params", "path": ["id"], "code": "invalid_type", "message": "…" }] }
```

A query list that may hold a single item: accept both shapes,
`z.union([z.string(), z.array(z.string())]).transform((v) => [v].flat())`.

## Replies

A handler returns `reply(status, body, init?)`. With `response` schemas,
only a declared status, with a body its schema accepts. Without, any status
and any body — the client still reads the type of the body.

The body sent is the **output** of the schema: an unknown key a Zod object
strips — a password hash — never leaves the server. A reply its schema
refuses is a 500, never an undeclared shape. `validateResponses: false`
skips the check.

A string is sent as `text/plain`, a `Blob`, stream or buffer as it is,
anything else as JSON. `redirect(location, status?)` answers a redirect
without a schema. `set.headers` adds headers to every reply of the request.

## Hooks

A hook applies to the routes declared **after** it: the chain reads in the
order the request runs.

```ts
const app = alxia()
	.decorate({ db })                              // ctx.db, everywhere after
	.get('/health', ({ reply }) => reply(200, 'ok')) // not guarded
	.derive(async ({ request, reply }) => {
		const user = await authenticate(request);
		return user ? { user } : reply(401, { error: 'unauthenticated' as const });
	})
	.get('/me', ({ user, reply }) => reply(200, user)); // ctx.user is typed
```

A reply a hook returns ends the request, and is added to the type of every
route after it: the client of `/me` reads the 401. `onError(hook)` turns a
thrown error into a reply the same way. An `HttpError` thrown and not caught
is answered as it says; any other error is a 500 that leaks nothing.

## Plugins

A plugin is an app. `use` mounts its routes under the app's prefix, behind
the app's hooks, and its hooks apply to the routes declared after it:

```ts
const auth = alxia().derive(async ({ request }) => ({ user: await authenticate(request) }));
const users = alxia({ prefix: '/users' }).get('/:id', ...);

const app = alxia({ prefix: '/api' }).use(auth).use(users); // GET /api/users/:id
```

## API

| export | |
| --- | --- |
| `alxia(options?)` | a new app. `prefix`, `validateResponses` |
| `Alxia` | the app: `get`, `post`, `put`, `patch`, `delete`, `options`, `head`, `decorate`, `derive`, `onError`, `use`, `fetch`, `listen`, `routes` |
| `Reply` | what a handler returns |
| `HttpError` | an error answered with its status and body |
| `ResponseValidationError` | a reply its schema refused, answered as a 500 |
| `RoutesOf<App>` | the route table of an app, as the client reads it |
| `Jsonify<T>` | what `T` reads as once it has crossed the wire |
| `StandardSchemaV1`, `InferInput`, `InferOutput` | the Standard Schema types |
| `ValidationErrorBody`, `InternalErrorBody`, `RoutingErrorBody` | the bodies of the 400, 500, 404 and 405 |
