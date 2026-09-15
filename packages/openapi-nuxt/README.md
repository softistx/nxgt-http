# @nxgt/openapi-nuxt

A [Nuxt](https://nuxt.com) module for the operations
[`@nxgt/openapi-codegen`](https://www.npmjs.com/package/@nxgt/openapi-codegen)
generates, with one spec for both ends of the app:

- **The server.** Your [Hono](https://hono.dev) app, typically built with
  [`@nxgt/openapi-hono`](https://www.npmjs.com/package/@nxgt/openapi-hono),
  is served by Nitro under a prefix, `/api` by default.
- **The client.** `useApi()` is auto-imported. It is a client bound to the
  spec through
  [`@nxgt/openapi-httpyz`](https://www.npmjs.com/package/@nxgt/openapi-httpyz),
  so its paths, inputs and replies are typed.
- **SSR in process.** While a page renders on the server, `useApi()` calls
  the Hono app without leaving the process, with the incoming request's
  cookies and headers. In the browser, it calls the same origin.
- **Presets.** `useApiData()` is `useAsyncData` with the client, and
  `createHonoApp()` is a Hono app whose `c.env.event` is the h3 event.

```ts
// nuxt.config.ts
export default defineNuxtConfig({
	modules: ['@nxgt/openapi-nuxt'],
	openapi: {
		server: 'server/app.ts',
		operations: 'server/generated/operations.ts',
	},
});
```

```vue
<script setup lang="ts">
const { data: reply } = await useApiData((api) =>
	api.get('/employees/{id}', { param: { id: 7 } }),
);
</script>

<template>
	<p v-if="reply?.status === 200">{{ reply.data.name }}</p>
</template>
```

## Install

```sh
bun add @nxgt/openapi-nuxt @nxgt/openapi-httpyz @nxgt/httpyz
bun add @nxgt/openapi-hono hono zod   # for the server
bun add -d @nxgt/openapi-codegen
```

`nuxt` 4, `@nxgt/openapi-httpyz` and `@nxgt/httpyz` are peers: the module
writes a client that imports them into your app. `hono` is an optional peer,
for `createHonoApp`.

## Setup

1. Generate the spec's code with `hono: true`, somewhere the app can import
   it, `server/generated/` for instance:

   ```ts
   // openapi-codegen.config.ts
   import { defineConfig } from '@nxgt/openapi-codegen';

   export default defineConfig({
   	input: 'openapi/openapi.yaml',
   	output: 'server/generated',
   	hono: true,
   });
   ```

2. Write the Hono app, with the spec's paths, **without the prefix**, and
   export it as the default:

   ```ts
   // server/app.ts
   import { createRoutes } from './generated/hono';

   const app = createHonoApp(); // auto-imported
   const routes = createRoutes(app);

   routes.get('/employees/{id}', async (c) => {
   	const { id } = c.req.valid('param');
   	return c.json(await employees.find(id), 200);
   });

   export default app;
   ```

3. Add the module to `nuxt.config.ts`, as above. Run `nuxi prepare`, or
   start the dev server, for `useApi()`'s types to exist.

## Usage

### The server

A request to `/api/employees/7` reaches the app as `/employees/7`: the module
takes the prefix off, then hands the request to `app.fetch`. The app answers
everything under the prefix, its own 404 included.

The app's `env` holds the h3 event, for what Nitro and its middleware keep on
it. `createHonoApp()` types it: it is
`new Hono<{ Bindings: { event: H3Event } }>()`, auto-imported in the
server's files, and importable from `@nxgt/openapi-nuxt/hono` elsewhere:

```ts
const app = createHonoApp();
app.get('/whoami', (c) => c.json({ user: c.env.event.context.user ?? null }));

// With variables of your own, and Hono's options:
const typed = createHonoApp<{ Variables: { user: User } }>({ strict: false });
```

### The client

`useApi()` is the client
[`createOpenApiClient`](https://www.npmjs.com/package/@nxgt/openapi-httpyz)
returns, bound to the generated table: `api.get('/employees/{id}', …)`,
`api.op('getEmployee', …)`, and the rest of its API.

- **During SSR**, the call goes through the request event's `fetch`: Nitro
  runs the app in process, and the page's cookies and headers go with it, so
  a session reaches the API as it would from the browser.
- **In the browser**, the call goes to the page's origin, under the prefix.

A reply is checked and decoded as `createOpenApiClient` does by default.
With `dates: 'date'`, a `Date` survives the SSR payload: Nuxt serializes it.

### Data for a page

`useApiData()` is `useAsyncData` whose handler receives the client:

```ts
const { data: reply, refresh } = await useApiData('employee', (api, { signal }) =>
	api.get('/employees/{id}', { param: { id: id.value } }, { signal }),
);
// reply.value?.status === 200: reply.value.data is an Employee
// reply.value?.status === 404: reply.value.data is the declared 404's body
```

- **The key is optional.** Nuxt's compiler gives a call without one a key
  of its own, as it does for `useAsyncData`.
- **A reply comes back without its `Response`,** which the SSR payload
  cannot carry: `{ status, type, data }`, narrowed by its status. A handler
  that returns anything else, `reply.data` for instance, gets it as it is.
- **`signal`** is aborted when Nuxt drops the call, on a newer refresh for
  instance. Pass it to the client's call.
- **The options are `useAsyncData`'s:** `lazy`, `server`, `watch`,
  `default`, `immediate` and the rest. `transform` and `pick` are not
  offered: shape the value in the handler.

### Middleware

`use()` adds middleware to the client in place. A plugin that runs after the
module's adds it for every call, on both sides:

```ts
// app/plugins/api-auth.ts
export default defineNuxtPlugin({
	dependsOn: ['@nxgt/openapi-nuxt'],
	setup() {
		useApi().use(async (request, next) => {
			request.headers.set('x-app', 'shop');
			return next(request);
		});
	},
});
```

### An API elsewhere

With `baseUrl`, the client calls that URL instead, from the server and the
browser, and `server` may be left out:

```ts
openapi: {
	operations: 'generated/operations.ts',
	baseUrl: 'https://api.example.com/v1',
},
```

## API

### Module options

Under `openapi` in `nuxt.config.ts`:

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `server` | `string` | none | the file whose default export is the Hono app, or anything with `fetch(request)`, relative to the app's root. Without it, nothing is served |
| `operations` | `string` | none | the generated `operations.ts`, relative to the app's root. Without it, there is no `useApi()` |
| `prefix` | `string` | `'/api'` | the path the app is served under, taken off before it answers. `api/` is read as `/api`; `/` throws |
| `baseUrl` | `string` | the page's origin, under `prefix` | the API elsewhere. See [An API elsewhere](#an-api-elsewhere) |
| `client` | `ClientOptions` | `{}` | `validate` and `decode`, as `createOpenApiClient` takes them |

#### ModuleOptions

The type of the options above.

#### ClientOptions

```ts
interface ClientOptions {
	readonly validate?: boolean | { readonly request?: boolean; readonly response?: boolean };
	readonly decode?: boolean;
}
```

What the client is created with. `decode: false` changes the replies' types
too, as it does for `createOpenApiClient`.

### Composables

#### useApi

```ts
function useApi(): Api;
```

The client the module's plugin provides, auto-imported: one per request on
the server, one in the browser. `Api` is `createOpenApiClient`'s client for
your table.

#### useApiData

```ts
function useApiData<T, DefaultT = undefined>(
	key: string,
	handler: (api: Api, context: ApiDataContext) => Promise<T>,
	options?: AsyncDataOptions<Payload<T>, Payload<T>, never[], DefaultT>,
): AsyncData<Payload<T> | DefaultT, NuxtError | undefined>;
// and without the key
```

`useAsyncData` with the client, auto-imported. `ApiDataContext` is
`{ signal: AbortSignal }`. `Payload<T>` is a reply without its `response`,
and any other value as it is. See [Data for a page](#data-for-a-page).

### Server

#### createHonoApp

```ts
function createHonoApp<E extends Env = {}>(options?: HonoOptions<NuxtEnv & E>): Hono<NuxtEnv & E>;
type NuxtEnv = { Bindings: NuxtBindings };
interface NuxtBindings { event: H3Event }
```

A Hono app whose `c.env.event` is the request's h3 event, auto-imported in
the server's files, and exported by `@nxgt/openapi-nuxt/hono`. `E` adds to
its `Env`; `options` are Hono's.

### Functions

#### normalizePrefix

```ts
function normalizePrefix(prefix: string): string;
```

The prefix as the module mounts it: one leading slash, no trailing one.
Throws for a prefix that names no path, such as `/`.

### Runtime

`@nxgt/openapi-nuxt/runtime` holds what the files the module writes call.
It imports neither Nuxt nor h3.

#### serveUnder

```ts
function serveUnder<Env>(app: FetchApp<Env>, prefix: string, request: Request, env?: Env): Response | Promise<Response>;
```

Answers `request` with `app`, the prefix taken off its path. A path outside
the prefix, `/apis` under `/api`, reaches it unchanged.

#### apiHttpOptions

```ts
function apiHttpOptions(target: ApiTarget): HttpClientOptions;
```

The `@nxgt/httpyz` options for one client: `baseUrl` when there is one, else
the event's `fetch` on the server, else the page's origin. Throws with none
of them.

#### ApiTarget

| Field | Type | Description |
| --- | --- | --- |
| `prefix` | `string` | the path the server is mounted under |
| `baseUrl` | `string` | the API elsewhere |
| `event` | `RequestEventLike` | on the server, the request being rendered |
| `origin` | `string` | in the browser, the page's origin. Default: `location.origin` |

#### FetchApp

```ts
interface FetchApp<Env = unknown> {
	fetch(request: Request, env?: Env): Response | Promise<Response>;
}
```

What `server` must export: a Hono app is one.

#### RequestEventLike

```ts
interface RequestEventLike {
	fetch?: (input: string, init?: RequestInit) => Promise<Response>;
}
```

The part of h3's event the client uses: its `fetch`, which calls Nitro in
process.

#### toPayload

```ts
function toPayload<T>(value: T): Payload<T>;
type Payload<T> = T extends { readonly response: Response } ? Omit<T, 'response'> : T;
```

`value` as the SSR payload can carry it: a reply without its `Response`.
`useApiData` passes its handler's result through it.

#### keyedArgs

```ts
function keyedArgs(args: readonly unknown[]): [key: string, handler: unknown, options: unknown];
```

`useApiData`'s arguments, the key first: the one the call gives, or the one
Nuxt's compiler appended. Throws with neither, or without a handler.

## Traps

- **The app's paths have no prefix.** It is served under `/api`, but its
  routes are the spec's, `/employees/{id}`. A spec whose `servers` says `/api`
  fits.
- **The prefix is the app's.** A Nitro route of your own under it, in
  `server/api/` for `/api`, competes with it. Pick another prefix, or move
  them into the app.
- **`useApi()` has no types before `nuxi prepare`.** They come from the
  files the module writes into `.nuxt/`.
- **Inside `createRoutes`' handlers, `c.env` is not typed.** The routes of
  `@nxgt/openapi-hono` do not carry the app's `Env` yet. `c.env.event`
  works there all the same; a plain Hono route, `app.get(…)`, has it typed.
- **Return a reply, or plain data, from `useApiData`'s handler.** Anything
  else the SSR payload cannot serialize, a `Response` or a class of your
  own, fails the render.
- **With `baseUrl`, SSR calls leave the process**, and carry none of the
  incoming request's cookies. Add them with a middleware if the API needs
  them.
- **The browser bundle holds the spec's schemas.** The client validates with
  them. `client: { validate: false, decode: false }` stops using them, but
  the table still imports them.
