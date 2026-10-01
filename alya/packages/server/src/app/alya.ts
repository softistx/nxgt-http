import {
	HttpError,
	type InternalErrorBody,
	ResponseValidationError,
	type RoutingErrorBody,
	type ValidationErrorBody,
	type ValidationIssue,
} from '../errors/errors';
import { type AnyReply, createReply, Reply, toResponse } from '../reply/reply';
import { readBody, readHeaders, readQuery } from '../request/read';
import { Router } from '../router/router';
import { check } from '../schema/standard-schema';
import type { JoinPath, RoutePath } from '../types/path';
import type { RedirectStatus } from '../types/status';
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

/** A route as the app runs it: its schema, its handler, and the hooks declared before it. */
export interface RouteDefinition {
	readonly method: Method;
	readonly path: string;
	readonly schema: RouteSchema;
	readonly handler: (ctx: never) => MaybePromise<AnyReply>;
	readonly derive: readonly DeriveHook[];
	readonly onError: readonly ErrorHook[];
}

export interface AlyaOptions<Prefix extends string> {
	/** Prepended to the path of every route declared on this app. */
	readonly prefix?: Prefix;
	/**
	 * Whether a reply is checked against the schema its route declares for
	 * its status, and sent as that schema's output: an unknown key a Zod
	 * object strips never leaves the server. On by default; a reply that
	 * fails is answered with a 500.
	 */
	readonly validateResponses?: boolean;
}

export interface ListenOptions {
	readonly port?: number | string;
	readonly hostname?: string;
	readonly development?: boolean;
	readonly idleTimeout?: number;
	readonly maxRequestBodySize?: number;
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
	): Alya<
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
	): Alya<
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
			: never;
	};
};

const redirect: RedirectFunction = (location, status) =>
	new Reply(status ?? (302 as RedirectStatus), undefined, {
		headers: { location: String(location) },
	}) as never;

const internal: InternalErrorBody = { error: 'internal' };

/**
 * An app: its routes, and the hooks they run.
 *
 * Every method returns the app itself, typed with what it added, so declare
 * it in one chain and export its type for the client:
 *
 * ```ts
 * const app = alya()
 *   .get('/users/:id', { params: z.object({ id: z.coerce.number() }), response: { 200: User, 404: NotFound } },
 *     ({ params, reply }) => { ... });
 * export type App = typeof app;
 * ```
 *
 * A hook applies to the routes declared after it, never before: the order of
 * the chain is the order of the request.
 */
export class Alya<
	Ctx extends object = Empty,
	Routes extends object = Empty,
	Prefix extends string = '',
	Shortcuts extends AnyReply = never,
> {
	/** Never set: carries the route table to `typeof app`, which the client reads. */
	declare readonly '~routes': Routes;

	readonly #prefix: string;
	readonly #validateResponses: boolean;
	readonly #router = new Router<RouteDefinition>();
	readonly #routes: RouteDefinition[] = [];
	#derive: DeriveHook[] = [];
	#onError: ErrorHook[] = [];

	constructor(options: AlyaOptions<Prefix> = {}) {
		this.#prefix = options.prefix ?? '';
		this.#validateResponses = options.validateResponses ?? true;
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

	/** Values every route after this reads from its context: a database, a logger. */
	decorate<const Values extends object>(
		values: Values,
	): Alya<Ctx & Values, Routes, Prefix, Shortcuts> {
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
	): Alya<
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
	): Alya<Ctx, Routes, Prefix, Shortcuts | Extract<Result, AnyReply>> {
		this.#onError.push(hook as unknown as ErrorHook);
		return this as never;
	}

	/**
	 * The routes of `plugin`, under this app's prefix, behind this app's hooks.
	 * Its hooks then apply to the routes declared on this app after it: a
	 * plugin can be an `auth` that only derives a `user`.
	 *
	 * The plugin is read once, here: declare it completely before using it.
	 */
	use<
		PluginCtx extends object,
		PluginRoutes extends object,
		PluginPrefix extends string,
		PluginShortcuts extends AnyReply,
	>(
		plugin: Alya<PluginCtx, PluginRoutes, PluginPrefix, PluginShortcuts>,
	): Alya<
		Ctx & PluginCtx,
		Routes & Prefixed<Prefix, PluginRoutes, Shortcuts>,
		Prefix,
		Shortcuts | PluginShortcuts
	> {
		for (const route of plugin.routes) {
			this.#register({
				...route,
				path: this.#join(route.path),
				derive: [...this.#derive, ...route.derive],
				onError: [...route.onError, ...this.#onError],
			});
		}
		const internals = plugin.#hooks();
		this.#derive = [...this.#derive, ...internals.derive];
		this.#onError = [...internals.onError, ...this.#onError];
		return this as never;
	}

	/** Every route, in the order declared: what `@alya/openapi` documents. */
	get routes(): readonly RouteDefinition[] {
		return this.#routes;
	}

	/**
	 * The app as a fetch handler: what `Bun.serve`, a test, or another
	 * runtime calls. Bound, so `export default { fetch: app.fetch }` works.
	 */
	readonly fetch = async (request: Request): Promise<Response> => {
		const url = new URL(request.url);
		const match = this.#router.match(request.method, url.pathname);
		if (match === undefined) return routingError(404, 'not_found');
		if ('allowed' in match) {
			return routingError(405, 'method_not_allowed', match.allowed);
		}
		return this.#handle(match.value, request, url, match.params);
	};

	/**
	 * `Bun.serve` with this app: its paths go to Bun's own router, and what
	 * none of them matches to `fetch`, which answers 404 or 405.
	 */
	listen(options: ListenOptions | number = {}): Bun.Server<undefined> {
		const settings = typeof options === 'number' ? { port: options } : options;
		const routes: Record<string, (request: Request) => Promise<Response>> = {};
		for (const [path, methods] of this.#router.paths()) {
			routes[path] = (request) => {
				const url = new URL(request.url);
				const route = methods.get(request.method);
				if (route === undefined) {
					return Promise.resolve(
						routingError(405, 'method_not_allowed', [...methods.keys()]),
					);
				}
				return this.#handle(
					route,
					request,
					url,
					this.#router.paramsAt(path, url.pathname),
				);
			};
		}
		return Bun.serve({ ...settings, routes, fetch: this.fetch });
	}

	#hooks(): { derive: DeriveHook[]; onError: ErrorHook[] } {
		return { derive: this.#derive, onError: this.#onError };
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
		this.#router.add(route.method, route.path, route);
		this.#routes.push(route);
	}

	async #handle(
		route: RouteDefinition,
		request: Request,
		url: URL,
		rawParams: Record<string, string>,
	): Promise<Response> {
		const headers = new Headers();
		const ctx: Record<string, unknown> & BaseContext = {
			request,
			url,
			route: route.path,
			set: { headers },
			reply: createReply,
			redirect,
		};
		try {
			for (const hook of route.derive) {
				let added = hook(ctx);
				if (added instanceof Promise) added = await added;
				if (added instanceof Reply) return send(added, headers);
				if (added !== null && typeof added === 'object') {
					Object.assign(ctx, added);
				}
			}

			const { schema } = route;
			const issues: ValidationIssue[] = [];
			const parts = [
				['params', schema.params, () => rawParams],
				['query', schema.query, () => readQuery(url)],
				['headers', schema.headers, () => readHeaders(request.headers)],
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
			if (schema.body !== undefined) {
				const body = await readBody(request);
				if (!body.ok) issues.push(body.issue);
				else {
					const checked = await check(schema.body, body.value, 'body');
					if (checked.ok) ctx['body'] = checked.value;
					else issues.push(...checked.issues);
				}
			}
			if (issues.length > 0) {
				const body: ValidationErrorBody = { error: 'validation', issues };
				return toResponse(400, body, headers);
			}

			let reply = route.handler(ctx as never);
			if (reply instanceof Promise) reply = await reply;
			if (!(reply instanceof Reply)) {
				throw new TypeError(
					`${route.method} ${route.path}: the handler returned no reply. ` +
						'Return ctx.reply(status, body).',
				);
			}
			return await this.#send(route, reply, headers);
		} catch (error) {
			for (const hook of route.onError) {
				let handled = hook(error, ctx);
				if (handled instanceof Promise) handled = await handled;
				if (handled instanceof Reply) return send(handled, new Headers());
			}
			if (error instanceof HttpError) {
				return toResponse(error.status, error.body, headers);
			}
			console.error(error);
			return toResponse(500, internal, new Headers());
		}
	}

	async #send(
		route: RouteDefinition,
		reply: AnyReply,
		headers: Headers,
	): Promise<Response> {
		const responses = route.schema.response;
		if (responses === undefined || isRedirect(reply)) {
			return send(reply, headers);
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
		if (!this.#validateResponses) return send(reply, headers);
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
			headers,
		);
	}
}

function isRedirect(reply: AnyReply): boolean {
	return reply.status >= 300 && reply.status < 400 && reply.body === undefined;
}

function send(reply: AnyReply, headers: Headers): Response {
	if (reply.headers !== undefined) {
		for (const [key, value] of new Headers(reply.headers)) {
			headers.set(key, value);
		}
	}
	return toResponse(reply.status, reply.body, headers);
}

function routingError(
	status: 404 | 405,
	error: RoutingErrorBody['error'],
	allowed?: readonly string[],
): Response {
	const headers = new Headers();
	if (allowed !== undefined) headers.set('allow', allowed.join(', '));
	const body: RoutingErrorBody = { error };
	return toResponse(status, body, headers);
}

/** A new app. */
export function alya<const Prefix extends '' | RoutePath = ''>(
	options: AlyaOptions<Prefix> = {},
): Alya<Empty, Empty, Prefix, never> {
	return new Alya(options);
}

/** The route table of an app, as the client reads it. */
export type RoutesOf<App> = App extends { readonly '~routes': infer Routes }
	? Routes
	: never;

export type { Outcome };
