/**
 * The types of `routes`. Every lookup is an index into the interfaces the
 * generator wrote, never a conditional type, so a route costs TypeScript the
 * same whether the spec has five operations or five hundred.
 */
import type { Context, Hono, MiddlewareHandler, Next } from 'hono';
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

/** What `HonoSpec` in `hono.gen.ts` gathers. */
export interface ApiSpec {
	/** `Operations`, from `types.gen.ts`, keyed by `operationId`. */
	operations: object;
	/** `Replies`, from `hono.gen.ts`, keyed by `operationId`. */
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

/**
 * The handler of operation `Id`: `c.req.valid()` holds its validated
 * parameters and body, and it returns one of the replies the spec declares.
 */
export type RouteHandler<S extends ApiSpec, Id extends string> = (
	c: Context<
		any,
		(Entry<S, Id> & { honoPath: string })['honoPath'],
		{ out: Entry<S, Id> & {} }
	>,
	next: Next,
) => Reply<S, Id> | Promise<Reply<S, Id>>;

/** Middlewares, then the handler. */
export type Chain<S extends ApiSpec, Id extends string> = [
	...MiddlewareHandler[],
	RouteHandler<S, Id>,
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

export type Routes<
	S extends ApiSpec,
	Sc extends Scope = Whole<S>,
	Prefix extends string = '',
> = {
	readonly [M in Method]: <P extends Sc['paths'][M] & `${Prefix}${string}`>(
		path: P,
		...chain: Chain<S, S['routes'][`${M} ${P}` & keyof S['routes']] & string>
	) => Routes<S, Sc, Prefix>;
} & {
	/** Registers an operation by its `operationId`. */
	operation<Id extends Sc['ids']>(
		id: Id,
		...chain: Chain<S, Id>
	): Routes<S, Sc, Prefix>;
	/**
	 * Marks where in a chain the request is validated, when a middleware
	 * needs validated input: `routes.put(path, auth, routes.validate, check, handler)`.
	 * Without it, validation runs after every middleware.
	 */
	readonly validate: MiddlewareHandler;
	/** The same routes, with other options for the routes registered through it. */
	with(options: ApiOptions): Routes<S, Sc, Prefix>;
};

export interface Api<S extends ApiSpec> {
	/** Registers routes on `app`, which may be a module's sub-app. */
	routes<
		Prefix extends string = '',
		Tag extends keyof S['tags'] & string = never,
	>(
		app: Hono<any, any, any>,
		options?: RoutesOptions<Prefix, Tag>,
	): Routes<S, ScopeOf<S, Tag>, Prefix>;
	/** The `operationId`s no route was registered for, of one tag or of all. */
	missing(tag?: keyof S['tags'] & string): string[];
	/** Throws, listing them, when an operation of the tag, or of the spec, has no route. */
	assertComplete(tag?: keyof S['tags'] & string): void;
}
