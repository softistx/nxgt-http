# @alxia/janus

Identities, sessions and permissions for [alxia](https://www.npmjs.com/package/@alxia/core),
on [`@nxgt/janus`](https://www.npmjs.com/package/@nxgt/janus): your process,
your database. The user typed in the context, the session cookie kept and
renewed, janus's refusals answered — every one typed for the client. No
dependency.

```sh
bun add @alxia/janus @nxgt/janus
```

It mirrors [`@nxgt/janus-hono`](https://www.npmjs.com/package/@nxgt/janus-hono):
the same cookie, the same rules, the same bodies.

## Usage

```ts
import { alxia } from '@alxia/core';
import { janusErrors, sendSession, session, signOut } from '@alxia/janus';
import { createMemoryStores, janus, scryptHasher } from '@nxgt/janus';

const auth = janus({
	user: z.object({ email: z.email(), name: z.string() }),
	password: { login: 'email' },
	store: createMemoryStores(),       // your database's adapter in production
	hasher: scryptHasher(),
});

const app = alxia()
	.use(janusErrors())                                  // janus's refusals, typed
	.post('/signin', { body: SignIn }, async (ctx) => {
		const signedIn = await auth.signIn(ctx.body);
		return ctx.reply(200, { id: sendSession(ctx, auth, signedIn).id }); // the token in the cookie
	})
	.post('/signout', async (ctx) => ctx.reply(200, await signOut(ctx, auth)))
	.use(session(auth, { required: true }))              // every route after it
	.get('/me', ({ user, reply }) => reply(200, user));  // user typed by the schema
```

## `session(auth, options?)`

The routes after it read `user` and `session`. With `required: true`, an
anonymous request is a 401 `{ error: 'unauthenticated' }` and `user` is
never `null`; without, it is `null` for an anonymous request. `type` narrows
to one user type of a multi-type `janus()`.

The session is read from `Authorization: Bearer`, `X-Session-Token`, or the
cookie. One renewed in passing is sent again as a cookie after the route —
only to a request that presented it as one, and never over a session
cookie the route set itself. **An outage is not anonymous**: a store that
cannot answer is `STORE_FAILED`, answered 503 by `janusErrors()`.

## `sendSession`, `signOut`, devices

`sendSession(ctx, auth, signedIn)` sets the session cookie after `signUp`
or `signIn` and returns the user: the token is never in a body. With a
`deviceToken` it sets the device cookie too; `deviceOf(ctx)` reads it back
for `signIn(…, { device })`. `signOut(ctx, auth)` revokes the session and
clears the cookie, whatever the answer.

## `janusErrors(options?)`

Every `JanusError` a route after it throws is answered with janus's status
and a body holding its `code` and only what a client can act on — the
issues, a minimum length, attempts left, seconds to wait (with
`Retry-After`). Never a login, a reason or a cause. `report(error, ctx)` is
called for the 5xx.

| status | codes |
| --- | --- |
| 400 | `USER_INVALID`, `PASSWORD_TOO_SHORT`, `TOKEN_*`… |
| 401 | `CREDENTIALS_INVALID`, `CODE_INVALID` |
| 403 | `USER_INACTIVE`, `STEP_UP_REQUIRED` |
| 404 | `NOT_FOUND` |
| 409 | `LOGIN_TAKEN`, `VERSION_CONFLICT`, `SECOND_FACTOR_*` |
| 503 | `STORE_FAILED` |

## `permission(access, permission, type, load, options?)`

A guard on `@nxgt/janus/permissions`: the routes after it run only if the
subject — the session's `user`, or `options.subject(ctx)` — holds
`permission` on the object `load` finds, which they read as `object`.
Anonymous is a 401, nothing loaded a 404, a denial a 403, each typed. Scope
it with `group`:

```ts
app.use(session(auth)).group('/records/:id', (records) =>
	records
		.use(permission(access, 'view', 'record', byParam('id', findRecord)))
		.get('/', ({ object, reply }) => reply(200, object)),
);
```

`byParam(name, find)` loads by a path parameter. A permission whose
condition needs a context takes `ctx: (ctx, object) => …`, required by the
types exactly then.

## API

| export | |
| --- | --- |
| `session(auth, options?)` | the plugin: `user`, `session` |
| `sendSession`, `signOut`, `deviceOf`, `sendDevice` | cookies |
| `janusErrors(options?)` | the plugin: janus's refusals answered |
| `permission(…)`, `byParam(…)` | the guard |
| `bodyOf`, `statusOf` | a refusal's body and status |
| `UnauthenticatedBody`, `JanusErrorBody`, `PermissionRefusedBody`, … | their types |
