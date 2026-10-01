import type {
	Alxia,
	AnyReply,
	BaseContext,
	Empty,
	JoinPath,
	Reply,
	RouteEntryOf,
	RoutePath,
	StatusCode,
} from '@alxia/core';
import {
	createYoga,
	type GraphQLSchemaWithContext,
	type YogaInitialContext,
	type YogaServerInstance,
	type YogaServerOptions,
} from 'graphql-yoga';
import { renderSandbox, SANDBOX_POLICY, type SandboxOptions } from './sandbox';

/** The parts of a route's context Yoga owns, or that mean nothing to a resolver. */
type RouteOnly =
	| 'params'
	| 'query'
	| 'headers'
	| 'cookies'
	| 'body'
	| 'reply'
	| 'redirect';

/**
 * What alxia hands Yoga for each request: the context its hooks built —
 * `user`, `db`, `log`… — with `request`, `url`, `ip` and `set`, through
 * which a resolver sets a cookie or a header on the response.
 */
export type ServerContext<Ctx> = Omit<BaseContext & Ctx, RouteOnly>;

/**
 * What a resolver reads as its context: Yoga's own, the app's, and what
 * the `context` option adds. Type a schema with it:
 *
 * ```ts
 * const base = alxia().use(bearer({ jwt }));
 * const schema = createSchema<GraphQLContext<typeof base>>({ ... });
 * ```
 */
export type GraphQLContext<App, UserContext = Empty> = App extends {
	readonly '~context': infer Ctx;
}
	? YogaInitialContext & ServerContext<Ctx> & UserContext
	: never;

type YogaContext = Record<string, any>;

export interface GraphQLOptions<
	ServerCtx extends YogaContext,
	UserCtx extends YogaContext,
	Path extends RoutePath,
	SchemaCtx = unknown,
> extends Omit<
		YogaServerOptions<ServerCtx, UserCtx>,
		'graphqlEndpoint' | 'cors' | 'schema' | 'graphiql'
	> {
	/**
	 * What a browser gets at the endpoint: Yoga's GraphiQL, Apollo Sandbox,
	 * or nothing. GraphiQL by default; turn both off in production.
	 */
	readonly ide?: 'graphiql' | 'apollo-sandbox' | false;
	/** GraphiQL's options, Yoga's own, when `ide` is `graphiql`. */
	readonly graphiql?: Exclude<
		YogaServerOptions<ServerCtx, UserCtx>['graphiql'],
		boolean
	>;
	/** Apollo Sandbox's options, when `ide` is `apollo-sandbox`. */
	readonly sandbox?: SandboxOptions;
	/**
	 * The schema, from Yoga's `createSchema`, Pothos, or any tool that types
	 * its context. Its context must be one the app builds: a resolver that
	 * reads `user` behind no hook that derives one is a compile error.
	 */
	readonly schema: GraphQLSchemaWithContext<SchemaCtx>;
	/** Where the endpoint is, under the app's prefix. `/graphql` by default. */
	readonly path?: Path;
	/**
	 * Yoga's own CORS. Off by default: `@alxia/cors` answers for the whole
	 * app, this endpoint included.
	 */
	readonly cors?: YogaServerOptions<ServerCtx, UserCtx>['cors'];
}

/**
 * The check Yoga's types leave out: the context the app builds must hold
 * what the schema's resolvers read. A mistake comes back as a `schema`
 * whose type is the message.
 */
type ProvidesContext<Provided, Required> = Provided extends Required
	? unknown
	: {
			readonly schema: `the schema's resolvers read a context the app does not build: missing ${Exclude<
				keyof Required,
				keyof Provided
			> &
				string}`;
		};

/** What the endpoint answers, as alxia's client sees it: a body to read as GraphQL. */
type GraphQLReply = Reply<StatusCode, ReadableStream<Uint8Array> | undefined>;

export type GraphQLRoutes<
	Path extends string,
	Shortcuts extends AnyReply,
> = RouteEntryOf<'GET', Path, Empty, GraphQLReply, Shortcuts> &
	RouteEntryOf<'POST', Path, Empty, GraphQLReply, Shortcuts>;

/**
 * What GraphiQL loads: Yoga's page from unpkg, and queries to this server.
 * `@alxia/secure-headers` keeps a policy a response already has.
 */
const GRAPHIQL_POLICY = [
	"default-src 'self'",
	"script-src 'self' 'unsafe-inline' https://unpkg.com",
	"style-src 'self' 'unsafe-inline' https://unpkg.com",
	"img-src 'self' data: https:",
	"font-src 'self' data: https:",
	"worker-src 'self' blob:",
	"connect-src 'self'",
].join('; ');

/**
 * A GraphQL endpoint on `app`, served by [GraphQL Yoga](https://the-guild.dev/graphql/yoga-server):
 * `GET` and `POST` at `path`, behind every hook declared on `app` before it.
 * A guard before it guards it; what the hooks derived is in each
 * resolver's context, typed. Yoga's options pass through — `plugins`
 * (Envelop's and Yoga's), `graphiql`, `maskedErrors`, `batching`… —
 * and subscriptions are served over server-sent events.
 *
 * ```ts
 * const app = alxia()
 *   .use(bearer({ jwt }))
 *   .use((app) => graphql(app, { schema, plugins: [useDepthLimit()] }));
 * ```
 */
export function graphql<
	Ctx extends object,
	Routes extends object,
	Prefix extends string,
	Shortcuts extends AnyReply,
	SchemaCtx,
	UserCtx extends YogaContext = Empty,
	const Path extends RoutePath = '/graphql',
>(
	app: Alxia<Ctx, Routes, Prefix, Shortcuts>,
	options: GraphQLOptions<ServerContext<Ctx>, UserCtx, Path, SchemaCtx> &
		ProvidesContext<
			YogaInitialContext & ServerContext<Ctx> & UserCtx,
			SchemaCtx
		>,
): Alxia<
	Ctx,
	Routes & GraphQLRoutes<JoinPath<Prefix, Path>, Shortcuts>,
	Prefix,
	Shortcuts
> {
	const {
		path = '/graphql' as Path,
		cors = false,
		ide = 'graphiql',
		graphiql,
		sandbox,
		...yogaOptions
	} = options;
	// One Yoga per path it is served at: a plugin mounted under a prefix
	// serves the same routes at a longer path, and GraphiQL must ask that one.
	const servers = new Map<string, YogaServerInstance<YogaContext, UserCtx>>();
	const yogaAt = (endpoint: string) => {
		let yoga = servers.get(endpoint);
		if (yoga === undefined) {
			yoga = createYoga<YogaContext, UserCtx>({
				...(yogaOptions as YogaServerOptions<YogaContext, UserCtx>),
				graphqlEndpoint: endpoint,
				cors,
				graphiql: (ide === 'graphiql'
					? (graphiql ?? true)
					: false) as YogaServerOptions<YogaContext, UserCtx>['graphiql'],
			});
			servers.set(endpoint, yoga);
		}
		return yoga;
	};

	const handler = async (ctx: Record<string, unknown> & BaseContext) => {
		const {
			params: _params,
			query: _query,
			headers: _headers,
			cookies: _cookies,
			body: _body,
			reply,
			redirect: _redirect,
			...server
		} = ctx;
		if (
			ide === 'apollo-sandbox' &&
			ctx.request.method === 'GET' &&
			ctx.request.headers.get('accept')?.includes('text/html') &&
			!ctx.url.searchParams.has('query')
		) {
			const endpoint = new URL(ctx.route, ctx.url.origin).href;
			return reply(200, renderSandbox(endpoint, sandbox), {
				headers: {
					'content-type': 'text/html;charset=utf-8',
					'content-security-policy': SANDBOX_POLICY,
				},
			});
		}
		const response = await yogaAt(ctx.route).fetch(ctx.request, server);
		const headers = new Headers(response.headers);
		if (
			headers.get('content-type')?.startsWith('text/html') &&
			!headers.has('content-security-policy')
		) {
			headers.set('content-security-policy', GRAPHIQL_POLICY);
		}
		return reply(response.status as StatusCode, response.body ?? undefined, {
			headers,
		});
	};

	const route = app as unknown as {
		get(path: string, handler: unknown): unknown;
		post(path: string, handler: unknown): unknown;
	};
	route.get(path, handler);
	route.post(path, handler);
	return app as never;
}
