# @alxia/graphql

GraphQL for [alxia](https://www.npmjs.com/package/@alxia/core), served by
[GraphQL Yoga](https://the-guild.dev/graphql/yoga-server). The endpoint is a
route like any other: behind the app's hooks, guarded by its guards, its
resolvers reading the context those hooks built — typed, and checked.
Yoga's plugin system is yours whole: Envelop's plugins and Yoga's own.

```sh
bun add @alxia/graphql graphql-yoga graphql
```

`graphql-yoga` and `graphql` are peers: the package declares no dependency.

## Usage

```ts
import { alxia } from '@alxia/core';
import { graphql, type GraphQLContext } from '@alxia/graphql';
import { bearer } from '@alxia/jwt';
import { createSchema } from 'graphql-yoga';

const base = alxia()
	.decorate({ db })
	.use(bearer({ jwt, schema: Claims }));        // every route after it needs a token

const schema = createSchema<GraphQLContext<typeof base>>({
	typeDefs: /* GraphQL */ `type Query { me: String! }`,
	resolvers: {
		Query: { me: (_, __, { user, db }) => db.name(user.sub) }, // user and db typed
	},
});

const app = base.use((app) => graphql(app, { schema }));   // POST and GET /graphql
app.listen(3000);
```

`graphql(app, options)` adds `GET` and `POST` routes at `path` —
`/graphql` by default, under the app's prefix — and returns the app. Given
to `use` as a function, it stays in the chain and sees the app's type.

## The context

A resolver's context is Yoga's (`request`, `params`), the app's — every
`decorate`, every `derive`, every plugin's: `user`, `db`, `log`,
`requestId` — and `set`, through which it sets a header or a cookie:

```ts
login: async (_, { name }, { set }) => {
	set.cookies.set('session', await sign(name), { httpOnly: true });
	return true;
},
```

`GraphQLContext<typeof app>` is that type. A schema whose resolvers read
what the app does not build is a compile error:

```
the schema's resolvers read a context the app does not build: missing user
```

## Yoga's plugins

Every Yoga option passes through, but `graphqlEndpoint`, which `path` sets:

```ts
import { useDepthLimit } from '@envelop/depth-limit';
import { useResponseCache } from '@graphql-yoga/plugin-response-cache';

graphql(app, {
	schema,
	plugins: [useDepthLimit({ maxDepth: 8 }), useResponseCache({ session: ({ request }) => ... })],
	maskedErrors: true,            // Yoga's default: an error's message never leaks
	graphiql: process.env.NODE_ENV !== 'production',
	batching: true,
});
```

- **Subscriptions** are served over server-sent events, Yoga's default:
  `async *subscribe` in a resolver, `Accept: text/event-stream` on the
  request. `@alxia/compress` never compresses an event stream.
- **GraphiQL** answers a `GET` from a browser, with a
  `Content-Security-Policy` that lets it load; `@alxia/secure-headers` keeps
  it.
- **CORS** is `@alxia/cors`'s for the whole app: Yoga's own is off unless
  `cors` is given.

## API

| export | |
| --- | --- |
| `graphql(app, options)` | the endpoint: `schema`, `path`, and every Yoga option |
| `GraphQLContext<App, UserContext?>` | what a resolver reads |
| `ServerContext<Ctx>`, `GraphQLOptions`, `GraphQLRoutes` | its types |
