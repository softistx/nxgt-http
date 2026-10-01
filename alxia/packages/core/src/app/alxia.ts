import {
	HttpError,
	type InternalErrorBody,
	ResponseValidationError,
	type RoutingErrorBody,
	type ValidationErrorBody,
	type ValidationIssue,
} from '../errors/errors';
import { type AnyReply, createReply, Reply, toResponse } from '../reply/reply';
import {
	type BodyParser,
	readBody,
	readCookies,
	readHeaders,
	readQuery,
} from '../request/read';
import { Router } from '../router/router';
import { check, type StandardSchemaV1 } from '../schema/standard-schema';
import type { JoinPath, RoutePath } from '../types/path';
import type { RedirectStatus } from '../types/status';
import type {
	Socket,
	SocketContext,
	SocketEntryOf,
	SocketHandlers,
	SocketMessage,
	SocketSchema,
	SocketSend,
} from '../ws/types';
import type {
	BaseContext,
	Context,
	Empty,
	HandlerResult,
	MaybePromise,
	Method,
	Outcome,
	OutcomeOf,
	RedirectFunction,
	RequestContext,
	ResponseSettings,
	RouteEntryOf,
	RouteRecord,
	RouteSchema,
	ValidSchema,
} from './types';

/** A hook that runs before validation, and may add to the context or end the request. */
type DeriveHook = (ctx: Record<string, unknown>) => unknown;
/** A hook that turns an error into a reply, or lets the next one try. */
type ErrorHook = (
	error: unknown,
	ctx: BaseContext,
) => MaybePromise<AnyReply | undefined | void>;

/** Runs on every request, before routing; a `Response` it returns is sent as it is. */
export type RequestHook = (
	ctx: RequestContext,
) => MaybePromise<Response | undefined | void>;
/** Runs on every response, routed or not; a `Response` it returns replaces it. */
export type ResponseHook = (
	response: Response,
	ctx: RequestContext,
) => MaybePromise<Response | undefined | void>;
export type StartHook = (server: Bun.Server<unknown>) => MaybePromise<void>;
export type StopHook = () => MaybePromise<void>;

/** A route as the app runs it: its schema, its handler, and the hooks declared before it. */
export interface RouteDefinition {
	readonly method: Method;
	readonly path: string;
	readonly schema: RouteSchema;
	readonly handler: (ctx: never) => MaybePromise<AnyReply>;
	readonly derive: readonly DeriveHook[];
	readonly onError: readonly ErrorHook[];
}

/** A socket route as the app runs it. */
export interface SocketDefinition {
	readonly path: string;
	readonly schema: SocketSchema;
	readonly handlers: SocketHandlers<never, never, never>;
	readonly derive: readonly DeriveHook[];
	readonly onError: readonly ErrorHook[];
}

type Definition =
	| ({ readonly kind: 'http' } & RouteDefinition)
	| ({ readonly kind: 'ws' } & SocketDefinition);

/** What is global to an app, wherever it is declared: a group's or a plugin's included. */
interface Globals {
	readonly onRequest: RequestHook[];
	readonly onResponse: ResponseHook[];
	readonly onStart: StartHook[];
	readonly onStop: StopHook[];
	readonly parsers: BodyParser[];
}

export interface AlxiaOptions<Prefix extends string> {
	/** Prepended to the path of every route declared on this app. */
	readonly prefix?: Prefix;
	/**
	 * Whether a reply is checked against the schema its route declares for
	 * its status, and sent as that schema's output: an unknown key the
	 * schema strips never leaves the server. On by default; a reply that
	 * fails is answered with a 500.
	 */
	readonly validateResponses?: boolean;
	/**
	 * Reads the client's address. By default, the address of the connection;
	 * behind a proxy you trust, read its header instead.
	 */
	readonly ip?: (
		request: Request,
		server: Bun.Server<unknown> | undefined,
	) => string | undefined;
}

export interface ListenOptions {
	readonly port?: number | string;
	readonly hostname?: string;
	readonly development?: boolean;
	readonly idleTimeout?: number;
	readonly maxRequestBodySize?: number;
	readonly tls?: Bun.TLSOptions;
}

/** A route method: `app.get(path, schema, handler)` or `app.get(path, handler)`. */
export interface RouteMethod<
	M extends Method,
	Ctx extends object,
	Routes extends object,
	Prefix extends string,
	Shortcuts extends AnyReply,
> {
	<
		const Path extends RoutePath,
		Schema extends RouteSchema,
		Result extends HandlerResult<Schema>,
	>(
		path: Path,
		schema: Schema & ValidSchema<JoinPath<Prefix, Path>, Schema>,
		handler: (
			ctx: Context<Ctx, JoinPath<Prefix, Path>, Schema>,
		) => MaybePromise<Result>,
	): Alxia<
		Ctx,
		Routes & RouteEntryOf<M, JoinPath<Prefix, Path>, Schema, Result, Shortcuts>,
		Prefix,
		Shortcuts
	>;
	<const Path extends RoutePath, Result extends AnyReply>(
		path: Path,
		handler: (
			ctx: Context<Ctx, JoinPath<Prefix, Path>, Empty>,
		) => MaybePromise<Result>,
	): Alxia<
		Ctx,
		Routes & RouteEntryOf<M, JoinPath<Prefix, Path>, Empty, Result, Shortcuts>,
		Prefix,
		Shortcuts
	>;
}

/** The routes of a plugin, under the prefix of the app it is used by. */
type Prefixed<Prefix extends string, Routes, Shortcuts> = {
	readonly [Path in keyof Routes as Path extends string
		? JoinPath<Prefix, Path>
		: never]: {
		readonly [M in keyof Routes[Path]]: Routes[Path][M] extends RouteRecord<
			infer Input,
			infer Output
		>
			? RouteRecord<Input, Output | OutcomeOf<Shortcuts>>
			: Routes[Path][M];
	};
};

/** Any app, whatever it holds. */
export type AnyAlxia = Alxia<any, any, any, any>;

/**
 * A plugin written as a function: it receives the app and returns it, with
 * global hooks added. A plugin that adds to the context or declares routes
 * is an app of its own, given to `use`.
 */
export type Plugin = <App extends AnyAlxia>(app: App) => App;

const redirect: RedirectFunction = (location, status) =>
	new Reply(status ?? (302 as RedirectStatus), undefined, {
		headers: { location: String(location) },
	}) as never;

const internal: InternalErrorBody = { error: 'internal' };

/** What the pipeline returns once a socket is open: Bun wants no response then. */
const UPGRADED = Symbol('upgraded');

interface SocketData {
	readonly definition: SocketDefinition;
	readonly ctx: Record<string, unknown>;
	socket?: Socket<unknown, unknown>;
}

/**
 * An app: its routes, and the hooks they run.
 *
 * Every method returns the app itself, typed with what it added, so declare
 * it in one chain and export its type for the client:
 *
 * ```ts
 * const app = alxia()
 *   .get('/users/:id', { params: UserId, response: { 200: User, 404: NotFound } },
 *     ({ params, reply }) => { ... });
 * export type App = typeof app;
 * ```
 *
 * A route hook (`derive`, `decorate`, `onError`) applies to the routes
 * declared after it, never before: the order of the chain is the order of
 * the request. A global hook (`onRequest`, `onResponse`, `onStart`,
 * `onStop`, `parser`) applies to the whole app, wherever it is declared.
 */
export class Alxia<
	Ctx extends object = Empty,
	Routes extends object = Empty,
	Prefix extends string = '',
	Shortcuts extends AnyReply = never,
> {
	/** Never set: carries the route table to `typeof app`, which the client reads. */
	declare readonly '~routes': Routes;

	readonly #prefix: string;
	readonly #validateResponses: boolean;
	readonly #ip: NonNullable<AlxiaOptions<string>['ip']>;
	readonly #router = new Router<Definition>();
	readonly #routes: RouteDefinition[] = [];
	readonly #sockets: SocketDefinition[] = [];
	#derive: DeriveHook[] = [];
	#onError: ErrorHook[] = [];
	#globals: Globals = {
		onRequest: [],
		onResponse: [],
		onStart: [],
		onStop: [],
		parsers: [],
	};
	#server: Bun.Server<unknown> | undefined;

	constructor(options: AlxiaOptions<Prefix> = {}) {
		this.#prefix = options.prefix ?? '';
		this.#validateResponses = options.validateResponses ?? true;
		this.#ip =
			options.ip ??
			((request, server) => server?.requestIP(request)?.address ?? undefined);
		if (this.#prefix !== '' && !/^\/.*[^/]$/.test(this.#prefix)) {
			throw new TypeError(
				`The prefix "${this.#prefix}" must start with "/" and not end with one`,
			);
		}
	}

	readonly get = this.#method('GET') as RouteMethod<
		'GET',
		Ctx,
		Routes,
		Prefix,
		Shortcuts
	>;
	readonly post = this.#method('POST') as RouteMethod<
		'POST',
		Ctx,
		Routes,
		Prefix,
		Shortcuts
	>;
	readonly put = this.#method('PUT') as RouteMethod<
		'PUT',
		Ctx,
		Routes,
		Prefix,
		Shortcuts
	>;
	readonly patch = this.#method('PATCH') as RouteMethod<
		'PATCH',
		Ctx,
		Routes,
		Prefix,
		Shortcuts
	>;
	readonly delete = this.#method('DELETE') as RouteMethod<
		'DELETE',
		Ctx,
		Routes,
		Prefix,
		Shortcuts
	>;
	readonly options = this.#method('OPTIONS') as RouteMethod<
		'OPTIONS',
		Ctx,
		Routes,
		Prefix,
		Shortcuts
	>;
	readonly head = this.#method('HEAD') as RouteMethod<
		'HEAD',
		Ctx,
		Routes,
		Prefix,
		Shortcuts
	>;

	/**
	 * A WebSocket route. The upgrade request runs the hooks before it and is
	 * validated as a route's; each message is then checked by `message`, and
	 * each one sent by `send`. Open through `listen`: a socket needs a server.
	 *
	 * ```ts
	 * app.ws('/rooms/:room', { message: Chat, send: Chat }, {
	 *   open: (socket) => socket.subscribe(socket.data.params.room),
	 *   message: (socket, chat) => socket.publish(socket.data.params.room, chat),
	 * });
	 * ```
	 */
	ws<const Path extends RoutePath, Schema extends SocketSchema = Empty>(
		path: Path,
		schema: Schema,
		handlers: SocketHandlers<
			SocketContext<Ctx, JoinPath<Prefix, Path>, Schema>,
			SocketSend<Schema>,
			SocketMessage<Schema>
		>,
	): Alxia<
		Ctx,
		Routes & SocketEntryOf<JoinPath<Prefix, Path>, Schema>,
		Prefix,
		Shortcuts
	> {
		const definition: SocketDefinition = {
			path: this.#join(path),
			schema,
			handlers: handlers as SocketDefinition['handlers'],
			derive: [...this.#derive],
			onError: [...this.#onError],
		};
		this.#router.add('WS', definition.path, { kind: 'ws', ...definition });
		this.#sockets.push(definition);
		return this as never;
	}

	/** Values every route after this reads from its context: a database, a logger. */
	decorate<const Values extends object>(
		values: Values,
	): Alxia<Ctx & Values, Routes, Prefix, Shortcuts> {
		this.#derive.push(() => values);
		return this as never;
	}

	/**
	 * A hook run on every request to a route declared after it, before the
	 * request is validated. What it returns is added to the context; a reply
	 * it returns ends the request, and is added to the type of every such
	 * route, so the client reads it:
	 *
	 * ```ts
	 * .derive(async ({ request, reply }) => {
	 *   const user = await authenticate(request);
	 *   return user ? { user } : reply(401, { error: 'unauthenticated' as const });
	 * })
	 * ```
	 */
	derive<Result>(
		hook: (ctx: BaseContext & Ctx) => MaybePromise<Result>,
	): Alxia<
		Ctx &
			(Exclude<Result, AnyReply> extends infer Added extends object
				? Added
				: Empty),
		Routes,
		Prefix,
		Shortcuts | Extract<Result, AnyReply>
	> {
		this.#derive.push(hook as DeriveHook);
		return this as never;
	}

	/**
	 * A hook that turns an error thrown by a route declared after it into a
	 * reply. Returning nothing lets the next one try; past the last, an
	 * `HttpError` is answered as it says and anything else as a 500.
	 */
	onError<Result extends AnyReply | undefined | void>(
		hook: (
			error: unknown,
			ctx: BaseContext & Partial<Ctx>,
		) => MaybePromise<Result>,
	): Alxia<Ctx, Routes, Prefix, Shortcuts | Extract<Result, AnyReply>> {
		this.#onError.push(hook as unknown as ErrorHook);
		return this as never;
	}

	/**
	 * A global hook run on every request, before routing: a 404 included. A
	 * `Response` it returns is sent as it is, and is no part of any route's
	 * type: use it for what a typed client never asks — a CORS preflight, a
	 * redirect to HTTPS. What a client must read belongs in `derive`.
	 */
	onRequest(hook: RequestHook): this {
		this.#globals.onRequest.push(hook);
		return this;
	}

	/**
	 * A global hook run on every response, in the order declared: headers,
	 * compression, logging. A `Response` it returns replaces the one sent;
	 * keep its status, which the client's types promise.
	 */
	onResponse(hook: ResponseHook): this {
		this.#globals.onResponse.push(hook);
		return this;
	}

	/** Runs once `listen` has started the server. */
	onStart(hook: StartHook): this {
		this.#globals.onStart.push(hook);
		return this;
	}

	/** Runs when `stop` stops the server: close a pool, flush a log. */
	onStop(hook: StopHook): this {
		this.#globals.onStop.push(hook);
		return this;
	}

	/**
	 * Reads a body of `type` — a `content-type` prefix, or a pattern — for
	 * every route with a `body` schema, before the built-in JSON, form and
	 * text parsers.
	 */
	parser(type: string | RegExp, parse: BodyParser['parse']): this {
		this.#globals.parsers.push({ type, parse });
		return this;
	}

	/**
	 * Routes declared in a scope: the hooks `build` adds apply only to them.
	 * The routes keep every hook declared on this app before the group.
	 *
	 * ```ts
	 * app.group('/admin', (admin) => admin.derive(requireAdmin).get('/stats', ...));
	 * ```
	 */
	group<
		const Path extends RoutePath,
		GroupRoutes extends object,
		GroupCtx extends object,
		GroupShortcuts extends AnyReply,
	>(
		prefix: Path,
		build: (
			group: Alxia<Ctx, Empty, JoinPath<Prefix, Path>, Shortcuts>,
		) => Alxia<GroupCtx, GroupRoutes, JoinPath<Prefix, Path>, GroupShortcuts>,
	): Alxia<Ctx, Routes & GroupRoutes, Prefix, Shortcuts>;
	group<
		GroupRoutes extends object,
		GroupCtx extends object,
		GroupShortcuts extends AnyReply,
	>(
		build: (
			group: Alxia<Ctx, Empty, Prefix, Shortcuts>,
		) => Alxia<GroupCtx, GroupRoutes, Prefix, GroupShortcuts>,
	): Alxia<Ctx, Routes & GroupRoutes, Prefix, Shortcuts>;
	group(
		prefixOrBuild: string | ((group: AnyAlxia) => AnyAlxia),
		maybeBuild?: (group: AnyAlxia) => AnyAlxia,
	): AnyAlxia {
		const [prefix, build] =
			typeof prefixOrBuild === 'string'
				? [this.#join(prefixOrBuild), maybeBuild]
				: [this.#prefix, prefixOrBuild];
		if (build === undefined) throw new TypeError('group(): build is missing');
		const child = new Alxia({
			prefix,
			validateResponses: this.#validateResponses,
		});
		child.#derive = [...this.#derive];
		child.#onError = [...this.#onError];
		child.#globals = this.#globals;
		const built = build(child);
		for (const route of built.routes) this.#register(route);
		for (const socket of built.sockets) {
			this.#router.add('WS', socket.path, { kind: 'ws', ...socket });
			this.#sockets.push(socket);
		}
		return this;
	}

	/**
	 * A plugin. An app: its routes, under this app's prefix and behind this
	 * app's hooks, and its hooks, which then apply to the routes declared on
	 * this app after it — a plugin can be an `auth` that only derives a
	 * `user`. Its global hooks become this app's. It is read once, here:
	 * declare it completely before using it.
	 *
	 * Or a function, given this app, that returns it: a `Plugin`.
	 */
	use<Result extends AnyAlxia>(plugin: (app: this) => Result): Result;
	use<
		PluginCtx extends object,
		PluginRoutes extends object,
		PluginPrefix extends string,
		PluginShortcuts extends AnyReply,
	>(
		plugin: Alxia<PluginCtx, PluginRoutes, PluginPrefix, PluginShortcuts>,
	): Alxia<
		Ctx & PluginCtx,
		Routes & Prefixed<Prefix, PluginRoutes, Shortcuts>,
		Prefix,
		Shortcuts | PluginShortcuts
	>;
	use(plugin: AnyAlxia | ((app: any) => AnyAlxia)): AnyAlxia {
		if (!(plugin instanceof Alxia)) return plugin(this);
		for (const route of plugin.routes) {
			this.#register({
				...route,
				path: this.#join(route.path),
				derive: [...this.#derive, ...route.derive],
				onError: [...route.onError, ...this.#onError],
			});
		}
		for (const socket of plugin.sockets) {
			const mounted: SocketDefinition = {
				...socket,
				path: this.#join(socket.path),
				derive: [...this.#derive, ...socket.derive],
				onError: [...socket.onError, ...this.#onError],
			};
			this.#router.add('WS', mounted.path, { kind: 'ws', ...mounted });
			this.#sockets.push(mounted);
		}
		this.#derive = [...this.#derive, ...plugin.#derive];
		this.#onError = [...plugin.#onError, ...this.#onError];
		if (plugin.#globals !== this.#globals) {
			const globals = plugin.#globals;
			this.#globals.onRequest.push(...globals.onRequest);
			this.#globals.onResponse.push(...globals.onResponse);
			this.#globals.onStart.push(...globals.onStart);
			this.#globals.onStop.push(...globals.onStop);
			this.#globals.parsers.push(...globals.parsers);
		}
		return this;
	}

	/** Every route, in the order declared: what `@alxia/openapi` documents. */
	get routes(): readonly RouteDefinition[] {
		return this.#routes;
	}

	/** Every socket route, in the order declared. */
	get sockets(): readonly SocketDefinition[] {
		return this.#sockets;
	}

	/** The server `listen` started, until `stop`. */
	get server(): Bun.Server<unknown> | undefined {
		return this.#server;
	}

	/**
	 * The app as a fetch handler: what `Bun.serve`, a test, or another
	 * runtime calls. Bound, so `export default { fetch: app.fetch }` works.
	 * Given the server, as `Bun.serve` gives it, it can open a socket.
	 */
	readonly fetch = (
		request: Request,
		server?: Bun.Server<unknown>,
	): Promise<Response> => this.#serve(request, server, undefined);

	/** A request to the app, in process: `app.request('/users/1')`. */
	request(path: string, init?: RequestInit): Promise<Response> {
		return this.fetch(new Request(new URL(path, 'http://localhost'), init));
	}

	/**
	 * `Bun.serve` with this app: its paths go to Bun's own router, and what
	 * none of them matches to `fetch`, which answers 404 or 405.
	 */
	listen(options: ListenOptions | number = {}): Bun.Server<unknown> {
		const settings = typeof options === 'number' ? { port: options } : options;
		const routes: Record<
			string,
			(request: Request, server: Bun.Server<unknown>) => Promise<Response>
		> = {};
		for (const [path] of this.#router.paths()) {
			routes[path] = (request, server) => this.#serve(request, server, path);
		}
		const server = Bun.serve({
			...settings,
			routes,
			fetch: (request: Request, server: Bun.Server<unknown>) =>
				this.#serve(request, server, undefined),
			websocket: this.#websocket(),
		} as Bun.Serve.Options<SocketData>) as Bun.Server<unknown>;
		this.#server = server;
		for (const hook of this.#globals.onStart) {
			Promise.resolve()
				.then(() => hook(server))
				.catch((error) => console.error(error));
		}
		return server;
	}

	/** Stops the server `listen` started, then runs every `onStop` hook. */
	async stop(closeActiveConnections = false): Promise<void> {
		const server = this.#server;
		this.#server = undefined;
		if (server !== undefined) await server.stop(closeActiveConnections);
		for (const hook of this.#globals.onStop) await hook();
	}

	#join(path: string): string {
		if (this.#prefix === '') return path;
		return path === '/' ? this.#prefix : `${this.#prefix}${path}`;
	}

	#method(method: Method) {
		return (
			path: string,
			schemaOrHandler: RouteSchema | RouteDefinition['handler'],
			maybeHandler?: RouteDefinition['handler'],
		) => {
			const [schema, handler] =
				typeof schemaOrHandler === 'function'
					? [{}, schemaOrHandler]
					: [schemaOrHandler, maybeHandler];
			if (typeof handler !== 'function') {
				throw new TypeError(`${method} ${path}: the handler is missing`);
			}
			this.#register({
				method,
				path: this.#join(path),
				schema,
				handler,
				derive: [...this.#derive],
				onError: [...this.#onError],
			});
			return this;
		};
	}

	#register(route: RouteDefinition): void {
		this.#router.add(route.method, route.path, { kind: 'http', ...route });
		this.#routes.push(route);
	}

	/** The whole of a request: global hooks around the route's own pipeline. */
	async #serve(
		request: Request,
		server: Bun.Server<unknown> | undefined,
		path: string | undefined,
	): Promise<Response> {
		const url = new URL(request.url);
		const ctx: RequestContext = {
			request,
			url,
			server,
			ip: this.#ip(request, server),
		};
		let response: Response | typeof UPGRADED | undefined;
		try {
			for (const hook of this.#globals.onRequest) {
				let early = hook(ctx);
				if (early instanceof Promise) early = await early;
				if (early instanceof Response) {
					response = early;
					break;
				}
			}
			response ??= await this.#route(ctx, path);
		} catch (error) {
			console.error(error);
			response = toResponse(500, internal, new Headers());
		}
		if (response === UPGRADED) return undefined as never;
		for (const hook of this.#globals.onResponse) {
			try {
				let replaced = hook(response, ctx);
				if (replaced instanceof Promise) replaced = await replaced;
				if (replaced instanceof Response) response = replaced;
			} catch (error) {
				console.error(error);
			}
		}
		return response;
	}

	async #route(
		ctx: RequestContext,
		path: string | undefined,
	): Promise<Response | typeof UPGRADED> {
		const { request, url } = ctx;
		const upgrade =
			request.headers.get('upgrade')?.toLowerCase() === 'websocket';
		const find = (
			method: string,
		):
			| { readonly value: Definition; readonly params: Record<string, string> }
			| { readonly allowed: readonly string[] }
			| undefined => {
			if (path === undefined) return this.#router.match(method, url.pathname);
			const methods = this.#router.methodsAt(path);
			if (methods === undefined) return undefined;
			const value = methods.get(method);
			if (value !== undefined) {
				return { value, params: this.#router.paramsAt(path, url.pathname) };
			}
			return { allowed: [...methods.keys()] };
		};

		if (upgrade) {
			const socket = find('WS');
			if (
				socket !== undefined &&
				'value' in socket &&
				socket.value.kind === 'ws'
			) {
				return this.#upgrade(socket.value, ctx, socket.params);
			}
		}
		let match = find(request.method);
		let head = false;
		if (
			request.method === 'HEAD' &&
			match !== undefined &&
			'allowed' in match
		) {
			const get = find('GET');
			if (get !== undefined && 'value' in get) {
				match = get;
				head = true;
			}
		}
		if (match === undefined) return routingError(404, 'not_found');
		if ('allowed' in match) {
			const allowed = match.allowed.filter((method) => method !== 'WS');
			if (allowed.length === 0) return routingError(426, 'upgrade_required');
			return routingError(405, 'method_not_allowed', allowed);
		}
		const definition = match.value;
		if (definition.kind === 'ws') return routingError(426, 'upgrade_required');
		const response = await this.#handle(definition, ctx, match.params);
		return head
			? new Response(null, {
					status: response.status,
					headers: response.headers,
				})
			: response;
	}

	/**
	 * Runs the hooks of a route, then validates its request: the context its
	 * handler reads, or the response that ended it before.
	 */
	async #prepare(
		definition: RouteDefinition | SocketDefinition,
		request: RequestContext,
		rawParams: Record<string, string>,
		set: ResponseSettings,
		ctx: Record<string, unknown> & BaseContext,
	): Promise<Response | undefined> {
		for (const hook of definition.derive) {
			let added = hook(ctx);
			if (added instanceof Promise) added = await added;
			if (added instanceof Reply)
				return send(added, set, request.request.signal);
			if (added !== null && typeof added === 'object') {
				Object.assign(ctx, added);
			}
		}

		const { schema } = definition;
		const issues: ValidationIssue[] = [];
		const parts = [
			['params', schema.params, () => rawParams],
			['query', schema.query, () => readQuery(request.url)],
			['headers', schema.headers, () => readHeaders(request.request.headers)],
			['cookies', schema.cookies, () => readCookies(request.request.headers)],
		] as const;
		for (const [target, partSchema, read] of parts) {
			const raw = read();
			if (partSchema === undefined) {
				ctx[target] = raw;
				continue;
			}
			const checked = await check(partSchema, raw, target);
			if (checked.ok) ctx[target] = checked.value;
			else issues.push(...checked.issues);
		}
		ctx['body'] = undefined;
		const bodySchema = 'body' in schema ? schema.body : undefined;
		if (bodySchema !== undefined) {
			const body = await readBody(request.request, this.#globals.parsers);
			if (!body.ok) issues.push(body.issue);
			else {
				const checked = await check(bodySchema, body.value, 'body');
				if (checked.ok) ctx['body'] = checked.value;
				else issues.push(...checked.issues);
			}
		}
		if (issues.length > 0) {
			const body: ValidationErrorBody = { error: 'validation', issues };
			return send(new Reply(400, body), set);
		}
		return undefined;
	}

	#context(
		definition: RouteDefinition | SocketDefinition,
		request: RequestContext,
	): { ctx: Record<string, unknown> & BaseContext; set: ResponseSettings } {
		let cookies: Bun.CookieMap | undefined;
		const set: ResponseSettings & { readonly touched: () => boolean } = {
			headers: new Headers(),
			get cookies() {
				cookies ??= new Bun.CookieMap();
				return cookies;
			},
			touched: () => cookies !== undefined,
		};
		const ctx: Record<string, unknown> & BaseContext = {
			...request,
			route: definition.path,
			set,
			reply: createReply,
			redirect,
		};
		return { ctx, set };
	}

	async #handle(
		route: RouteDefinition,
		request: RequestContext,
		rawParams: Record<string, string>,
	): Promise<Response> {
		const { ctx, set } = this.#context(route, request);
		try {
			const early = await this.#prepare(route, request, rawParams, set, ctx);
			if (early !== undefined) return early;
			let reply = route.handler(ctx as never);
			if (reply instanceof Promise) reply = await reply;
			if (!(reply instanceof Reply)) {
				throw new TypeError(
					`${route.method} ${route.path}: the handler returned no reply. ` +
						'Return ctx.reply(status, body).',
				);
			}
			return await this.#send(route, reply, set, request.request.signal);
		} catch (error) {
			return this.#fail(route, error, ctx);
		}
	}

	async #fail(
		definition: RouteDefinition | SocketDefinition,
		error: unknown,
		ctx: BaseContext,
	): Promise<Response> {
		for (const hook of definition.onError) {
			let handled = hook(error, ctx);
			if (handled instanceof Promise) handled = await handled;
			if (handled instanceof Reply) return send(handled, ctx.set);
		}
		if (error instanceof HttpError) {
			return send(new Reply(error.status, error.body), ctx.set);
		}
		console.error(error);
		return toResponse(500, internal, new Headers());
	}

	async #send(
		route: RouteDefinition,
		reply: AnyReply,
		set: ResponseSettings,
		signal: AbortSignal,
	): Promise<Response> {
		const responses = route.schema.response;
		if (responses === undefined || isRedirect(reply)) {
			return send(reply, set, signal);
		}
		const schema = responses[reply.status as keyof typeof responses];
		if (schema === undefined) {
			throw new ResponseValidationError(
				route.method,
				route.path,
				reply.status,
				[
					{
						target: 'body',
						path: [],
						code: 'undeclared_status',
						message: `the route declares no ${reply.status} reply`,
					},
				],
			);
		}
		if (!this.#validateResponses) return send(reply, set, signal);
		const checked = await check(schema, reply.body, 'body');
		if (!checked.ok) {
			throw new ResponseValidationError(
				route.method,
				route.path,
				reply.status,
				checked.issues,
			);
		}
		return send(
			new Reply(reply.status, checked.value, { headers: reply.headers ?? {} }),
			set,
			signal,
		);
	}

	async #upgrade(
		definition: SocketDefinition,
		request: RequestContext,
		rawParams: Record<string, string>,
	): Promise<Response | typeof UPGRADED> {
		const { ctx, set } = this.#context(definition, request);
		try {
			const early = await this.#prepare(
				definition,
				request,
				rawParams,
				set,
				ctx,
			);
			if (early !== undefined) return early;
		} catch (error) {
			return this.#fail(definition, error, ctx);
		}
		if (request.server === undefined) {
			return routingError(426, 'upgrade_required');
		}
		const headers = new Headers(set.headers);
		if ((set as { touched?: () => boolean }).touched?.()) {
			for (const cookie of set.cookies.toSetCookieHeaders()) {
				headers.append('set-cookie', cookie);
			}
		}
		const data: SocketData = { definition, ctx };
		const upgraded = request.server.upgrade(request.request, { headers, data });
		return upgraded ? UPGRADED : routingError(426, 'upgrade_required');
	}

	#websocket(): Bun.WebSocketHandler<SocketData> {
		const validate = this.#validateResponses;
		const socketOf = (ws: Bun.ServerWebSocket<SocketData>) => {
			ws.data.socket ??= createSocket(ws, validate);
			return ws.data.socket;
		};
		const guard = async (
			ws: Bun.ServerWebSocket<SocketData>,
			run: () => MaybePromise<void>,
		) => {
			try {
				await run();
			} catch (error) {
				console.error(error);
				ws.close(1011, 'internal error');
			}
		};
		return {
			open: (ws) =>
				guard(ws, () =>
					ws.data.definition.handlers.open?.(socketOf(ws) as never),
				),
			message: (ws, raw) =>
				guard(ws, async () => {
					const { definition } = ws.data;
					const socket = socketOf(ws);
					const schema = definition.schema.message;
					let message: unknown =
						typeof raw === 'string' ? raw : new Uint8Array(raw);
					if (schema !== undefined) {
						const parsed = parseMessage(message);
						if (!parsed.ok) {
							ws.send(JSON.stringify(parsed.error));
							return;
						}
						const checked = await check(schema, parsed.value, 'message');
						if (!checked.ok) {
							const error: ValidationErrorBody = {
								error: 'validation',
								issues: checked.issues,
							};
							ws.send(JSON.stringify(error));
							return;
						}
						message = checked.value;
					}
					await definition.handlers.message(socket as never, message as never);
				}),
			close: (ws, code, reason) =>
				guard(ws, () =>
					ws.data.definition.handlers.close?.(
						socketOf(ws) as never,
						code,
						reason,
					),
				),
			drain: (ws) =>
				guard(ws, () =>
					ws.data.definition.handlers.drain?.(socketOf(ws) as never),
				),
		};
	}
}

function parseMessage(
	message: unknown,
):
	| { readonly ok: true; readonly value: unknown }
	| { readonly ok: false; readonly error: ValidationErrorBody } {
	if (typeof message !== 'string') return { ok: true, value: message };
	try {
		return { ok: true, value: JSON.parse(message) };
	} catch {
		return {
			ok: false,
			error: {
				error: 'validation',
				issues: [
					{
						target: 'message',
						path: [],
						code: 'invalid_json',
						message: 'The message is not valid JSON',
					},
				],
			},
		};
	}
}

function createSocket(
	ws: Bun.ServerWebSocket<SocketData>,
	validate: boolean,
): Socket<unknown, unknown> {
	const schema: StandardSchemaV1 | undefined = ws.data.definition.schema.send;
	const encode = async (message: unknown): Promise<string> => {
		if (schema === undefined || !validate) return JSON.stringify(message);
		const checked = await check(schema, message, 'body');
		if (!checked.ok) {
			throw new ResponseValidationError(
				'WS',
				ws.data.definition.path,
				101,
				checked.issues,
			);
		}
		return JSON.stringify(checked.value);
	};
	return {
		data: ws.data.ctx,
		async send(message) {
			ws.send(await encode(message));
		},
		async publish(topic, message) {
			ws.publish(topic, await encode(message));
		},
		subscribe: (topic) => ws.subscribe(topic),
		unsubscribe: (topic) => ws.unsubscribe(topic),
		isSubscribed: (topic) => ws.isSubscribed(topic),
		close: (code, reason) => ws.close(code, reason),
		raw: ws as Bun.ServerWebSocket<unknown>,
	};
}

function isRedirect(reply: AnyReply): boolean {
	return reply.status >= 300 && reply.status < 400 && reply.body === undefined;
}

function send(
	reply: AnyReply,
	set: ResponseSettings,
	signal?: AbortSignal,
): Response {
	const headers = new Headers(set.headers);
	if (reply.headers !== undefined) {
		for (const [key, value] of new Headers(reply.headers)) {
			headers.set(key, value);
		}
	}
	if ((set as { touched?: () => boolean }).touched?.()) {
		for (const cookie of set.cookies.toSetCookieHeaders()) {
			headers.append('set-cookie', cookie);
		}
	}
	return toResponse(reply.status, reply.body, headers, signal);
}

function routingError(
	status: 404 | 405 | 426,
	error: RoutingErrorBody['error'],
	allowed?: readonly string[],
): Response {
	const headers = new Headers();
	if (allowed !== undefined) headers.set('allow', allowed.join(', '));
	const body: RoutingErrorBody = { error };
	return toResponse(status, body, headers);
}

/** A new app. */
export function alxia<const Prefix extends '' | RoutePath = ''>(
	options: AlxiaOptions<Prefix> = {},
): Alxia<Empty, Empty, Prefix, never> {
	return new Alxia(options);
}

/** The route table of an app, as the client reads it. */
export type RoutesOf<App> = App extends { readonly '~routes': infer Routes }
	? Routes
	: never;

export type { Outcome };
