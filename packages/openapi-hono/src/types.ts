/**
 * The types of `routes`. Every lookup is an index into the interfaces the
 * generator wrote, never a conditional type, so a route costs TypeScript the
 * same whether the spec has five operations or five hundred.
 */
import type {
	Context,
	Env,
	Hono,
	MiddlewareHandler,
	Next,
	TypedResponse,
} from 'hono';
import type { JSONParsed } from 'hono/utils/types';
import type { ValidationErrorHook } from './errors';

export type Method =
	| 'get'
	| 'put'
	| 'post'
	| 'delete'
	| 'options'
	| 'head'
	| 'patch'
	| 'trace'
	| 'query';

type ByMethod = { [M in Method]: string };

/** What `HonoSpec` in `hono.ts` gathers. */
export interface ApiSpec {
	/** `Operations`, from `types.ts`, keyed by `operationId`. */
	operations: object;
	/** `Replies`, from `hono.ts`, keyed by `operationId`. */
	replies: object;
	/** `OperationsByRoute`: `'put /employees/{id}'` to its `operationId`. */
	routes: object;
	/** `PathsByMethod`. */
	paths: ByMethod;
	/** `OperationsByTag`. */
	tags: object;
	/** `PathsByTag`. */
	tagPaths: object;
}

/** The operations a `routes` offers: every one, or one tag's. */
export interface Scope {
	ids: string;
	paths: ByMethod;
}

export type Whole<S extends ApiSpec> = {
	ids: keyof S['operations'] & string;
	paths: S['paths'];
};

export type Tagged<S extends ApiSpec, T extends string> = {
	ids: S['tags'][T & keyof S['tags']] & string;
	paths: S['tagPaths'][T & keyof S['tagPaths']] & ByMethod;
};

/** Evaluated once per `routes()`, never per route. */
export type ScopeOf<S extends ApiSpec, Tag extends string> = [Tag] extends [
	never,
]
	? Whole<S>
	: Tagged<S, Tag>;

type Entry<S extends ApiSpec, Id extends string> = S['operations'][Id &
	keyof S['operations']];

type Reply<S extends ApiSpec, Id extends string> = S['replies'][Id &
	keyof S['replies']];

/** A JSON reply of the generated `Replies`. */
type JsonReply = TypedResponse<any, any, 'json'>;

/**
 * `c.json(body, status)` over the JSON replies `R` declares: the body is typed
 * by its status as it is written, so an editor offers its fields. Hono's own
 * `c.json` stays behind it, and the reply is typed as Hono types it, so what
 * the handler returns is checked against the spec as before. A body that is
 * not even part of the declared one falls to Hono's, and is refused there.
 */
export interface DeclaredJson<R> {
	json<
		Status extends Extract<R, JsonReply>['_status'],
		Body extends Partial<Extract<R, JsonReply & { _status: Status }>['_data']>,
	>(
		body: Body,
		status: Status,
		headers?: Record<string, string | string[]>,
	): Response & TypedResponse<JSONParsed<Body>, Status, 'json'>;
}

/**
 * The handler of operation `Id`: `c.req.valid()` holds its validated
 * parameters and body, and it returns one of the replies the spec declares.
 * `c.env` is the app's: `E`, from the `Hono<E>` the routes are registered on.
 */
export type RouteHandler<
	S extends ApiSpec,
	Id extends string,
	E extends Env = any,
> = (
	c: DeclaredJson<Reply<S, Id>> &
		Context<
			E,
			(Entry<S, Id> & { honoPath: string })['honoPath'],
			{ out: Entry<S, Id> & {} }
		>,
	next: Next,
) => Reply<S, Id> | Promise<Reply<S, Id>>;

/** Middlewares, then the handler. */
export type Chain<S extends ApiSpec, Id extends string, E extends Env = any> = [
	...MiddlewareHandler[],
	RouteHandler<S, Id, E>,
];

export interface ApiOptions {
	/** Answers a request the spec refuses. Default `validationErrorHandler`: a 400 listing the issues. */
	onValidationError?: ValidationErrorHook;
	/**
	 * Checks every reply against the spec: its status, its content type and,
	 * for JSON and text, its body. A reply that fails goes to
	 * `onValidationError`, as a 500 by default. For development and tests: it
	 * reads every reply body twice.
	 */
	validateResponses?: boolean;
}

export interface RoutesOptions<
	Prefix extends string = '',
	Tag extends string = never,
> extends ApiOptions {
	/**
	 * Where the app is mounted, as the spec writes it: `/employees`. Routes are
	 * registered relative to it, and only paths under it are offered.
	 */
	prefix?: Prefix;
	/** Offers only the operations with this tag. */
	tag?: Tag;
}

/** The `operationId` at `M P`. */
type RouteId<
	S extends ApiSpec,
	M extends Method,
	P extends string,
> = S['routes'][`${M} ${P}` & keyof S['routes']] & string;

type Mw = MiddlewareHandler;

/**
 * Registers the route of `M` at a path: the handler, after up to five
 * middlewares, then any number. One overload per length, as Hono's own
 * `app.get` has: with a rest of middlewares before it, a handler whose reply
 * is not finished yet could be one of them, and its `c` would go untyped, so
 * an editor would offer nothing in `c.json({ … })` while it is written.
 */
export interface Register<
	S extends ApiSpec,
	Sc extends Scope,
	Prefix extends string,
	M extends Method,
	E extends Env = any,
> {
	<P extends Sc['paths'][M] & `${Prefix}${string}`>(
		path: P,
		handler: RouteHandler<S, RouteId<S, M, P>, E>,
	): Routes<S, Sc, Prefix, E>;
	<P extends Sc['paths'][M] & `${Prefix}${string}`>(
		path: P,
		m1: Mw,
		handler: RouteHandler<S, RouteId<S, M, P>, E>,
	): Routes<S, Sc, Prefix, E>;
	<P extends Sc['paths'][M] & `${Prefix}${string}`>(
		path: P,
		m1: Mw,
		m2: Mw,
		handler: RouteHandler<S, RouteId<S, M, P>, E>,
	): Routes<S, Sc, Prefix, E>;
	<P extends Sc['paths'][M] & `${Prefix}${string}`>(
		path: P,
		m1: Mw,
		m2: Mw,
		m3: Mw,
		handler: RouteHandler<S, RouteId<S, M, P>, E>,
	): Routes<S, Sc, Prefix, E>;
	<P extends Sc['paths'][M] & `${Prefix}${string}`>(
		path: P,
		m1: Mw,
		m2: Mw,
		m3: Mw,
		m4: Mw,
		handler: RouteHandler<S, RouteId<S, M, P>, E>,
	): Routes<S, Sc, Prefix, E>;
	<P extends Sc['paths'][M] & `${Prefix}${string}`>(
		path: P,
		m1: Mw,
		m2: Mw,
		m3: Mw,
		m4: Mw,
		m5: Mw,
		handler: RouteHandler<S, RouteId<S, M, P>, E>,
	): Routes<S, Sc, Prefix, E>;
	<P extends Sc['paths'][M] & `${Prefix}${string}`>(
		path: P,
		...chain: Chain<S, RouteId<S, M, P>, E>
	): Routes<S, Sc, Prefix, E>;
}

/** `routes.operation()`, with the same overloads as a method's. */
export interface RegisterOperation<
	S extends ApiSpec,
	Sc extends Scope,
	Prefix extends string,
	E extends Env = any,
> {
	<Id extends Sc['ids']>(
		id: Id,
		handler: RouteHandler<S, Id, E>,
	): Routes<S, Sc, Prefix, E>;
	<Id extends Sc['ids']>(
		id: Id,
		m1: Mw,
		handler: RouteHandler<S, Id, E>,
	): Routes<S, Sc, Prefix, E>;
	<Id extends Sc['ids']>(
		id: Id,
		m1: Mw,
		m2: Mw,
		handler: RouteHandler<S, Id, E>,
	): Routes<S, Sc, Prefix, E>;
	<Id extends Sc['ids']>(
		id: Id,
		m1: Mw,
		m2: Mw,
		m3: Mw,
		handler: RouteHandler<S, Id, E>,
	): Routes<S, Sc, Prefix, E>;
	<Id extends Sc['ids']>(
		id: Id,
		m1: Mw,
		m2: Mw,
		m3: Mw,
		m4: Mw,
		handler: RouteHandler<S, Id, E>,
	): Routes<S, Sc, Prefix, E>;
	<Id extends Sc['ids']>(
		id: Id,
		m1: Mw,
		m2: Mw,
		m3: Mw,
		m4: Mw,
		m5: Mw,
		handler: RouteHandler<S, Id, E>,
	): Routes<S, Sc, Prefix, E>;
	<Id extends Sc['ids']>(
		id: Id,
		...chain: Chain<S, Id, E>
	): Routes<S, Sc, Prefix, E>;
}

export type Routes<
	S extends ApiSpec,
	Sc extends Scope = Whole<S>,
	Prefix extends string = '',
	E extends Env = any,
> = {
	readonly [M in Method]: Register<S, Sc, Prefix, M, E>;
} & {
	/** Registers an operation by its `operationId`. */
	readonly operation: RegisterOperation<S, Sc, Prefix, E>;
	/**
	 * Marks where in a chain the request is validated, when a middleware
	 * needs validated input: `routes.put(path, auth, routes.validate, check, handler)`.
	 * Without it, validation runs after every middleware.
	 */
	readonly validate: MiddlewareHandler;
	/** The same routes, with other options for the routes registered through it. */
	with(options: ApiOptions): Routes<S, Sc, Prefix, E>;
};

export interface Api<S extends ApiSpec> {
	/**
	 * Registers routes on `app`, which may be a module's sub-app. Their
	 * handlers' `c.env` is typed by the app's `Env`.
	 */
	routes<
		Prefix extends string = '',
		Tag extends keyof S['tags'] & string = never,
		E extends Env = any,
	>(
		app: Hono<E, any, any>,
		options?: RoutesOptions<Prefix, Tag>,
	): Routes<S, ScopeOf<S, Tag>, Prefix, E>;
	/** The `operationId`s no route was registered for, of one tag or of all. */
	missing(tag?: keyof S['tags'] & string): string[];
	/** Throws, listing them, when an operation of the tag, or of the spec, has no route. */
	assertComplete(tag?: keyof S['tags'] & string): void;
}
