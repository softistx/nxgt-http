import { AsyncLocalStorage } from 'node:async_hooks';
import {
	type Alxia,
	alxia,
	type BaseContext,
	type ContextOf,
	type Empty,
	type RequestContext,
} from '@alxia/core';

/** Why there is no context to read. */
export type ContextStorageErrorCode =
	/** Called outside any request: at startup, in a job, after the response. */
	| 'OUTSIDE_REQUEST'
	/** In a request, but not in a route declared after `contextStorage()`: a 404, a hook, a route before it. */
	| 'NOT_ROUTED';

export class ContextStorageError extends Error {
	override readonly name = 'ContextStorageError';
	readonly code: ContextStorageErrorCode;

	constructor(code: ContextStorageErrorCode) {
		super(
			code === 'OUTSIDE_REQUEST'
				? 'getContext(): called outside a request — use tryGetContext(), or runWithContext() in a job or a test'
				: 'getContext(): this request reached no route declared after contextStorage() — use it earlier, or getRequestContext()',
		);
		this.code = code;
	}
}

interface Holder {
	readonly request: RequestContext;
	ctx: BaseContext | undefined;
}

/**
 * One store for the process: every `contextStorage()` writes to it, and
 * `getContext()` reads it wherever it is called — the way `hono/context-storage`
 * works, so code written against one ports to the other.
 */
const storage = new AsyncLocalStorage<Holder>();

/**
 * The context of the route the current request reached: what its handler
 * reads — the request, `set`, `reply`, and what every hook before it added.
 * Throws a `ContextStorageError` outside a route declared after
 * `contextStorage()`.
 *
 * `Ctx` types what the hooks added; prefer the typed `get()` of the plugin
 * itself, typed by the app.
 */
export function getContext<Ctx extends object = Empty>(): BaseContext & Ctx {
	const holder = storage.getStore();
	if (holder === undefined) throw new ContextStorageError('OUTSIDE_REQUEST');
	if (holder.ctx === undefined) throw new ContextStorageError('NOT_ROUTED');
	return holder.ctx as BaseContext & Ctx;
}

/** `getContext()`, or `undefined` where it would throw: code that runs in and out of requests. */
export function tryGetContext<Ctx extends object = Empty>():
	| (BaseContext & Ctx)
	| undefined {
	return storage.getStore()?.ctx as (BaseContext & Ctx) | undefined;
}

/**
 * The request as every global hook sees it — before routing, in a 404, in
 * an `onResponse` — with the route it reached and the error it failed with.
 */
export function getRequestContext(): RequestContext {
	const holder = storage.getStore();
	if (holder === undefined) throw new ContextStorageError('OUTSIDE_REQUEST');
	return holder.request;
}

/**
 * Runs `work` with `ctx` as the current context: a job, a queue consumer,
 * a test calling a service that reads `getContext()`.
 */
export function runWithContext<T>(ctx: BaseContext, work: () => T): T {
	return storage.run({ request: ctx, ctx }, work);
}

/** The plugin, and its context typed by the app it follows. */
export type ContextStoragePlugin<App> = Alxia<Empty, Empty, '', never> & {
	/** `getContext()`, typed by `App`. */
	get(): ContextOf<App> extends never ? BaseContext : ContextOf<App>;
	/** `tryGetContext()`, typed by `App`. */
	tryGet():
		| (ContextOf<App> extends never ? BaseContext : ContextOf<App>)
		| undefined;
};

/**
 * The request's context, anywhere it runs, as a plugin: from the routes
 * declared after it, every function their handlers call — however deep,
 * through every `await` and timer — reads it with `getContext()`, without
 * it being passed down.
 *
 * Typed by the app it is used on: give the plugin that app's type, and its
 * `get()` returns what its routes read — the `user` a session derived, the
 * `db` decorated.
 *
 * ```ts
 * const base = alxia().decorate({ db }).use(session(auth, { required: true }));
 * export const requestContext = contextStorage<typeof base>();
 * const app = base.use(requestContext).get('/orders', ({ reply }) => reply(200, listOrders()));
 *
 * // orders.ts — no context passed
 * export const listOrders = () => {
 *   const { db, user } = requestContext.get();
 *   return db.orders.forUser(user.id);
 * };
 * ```
 */
export function contextStorage<App = undefined>(): ContextStoragePlugin<App> {
	const plugin = alxia()
		.around((request, next) => {
			const current = storage.getStore();
			if (current?.request.request === request.request) return next();
			return storage.run({ request, ctx: undefined }, next);
		})
		.wrap((ctx, next) => {
			const holder = storage.getStore();
			if (holder !== undefined) holder.ctx = ctx;
			return next();
		});
	return Object.assign(plugin, {
		get: () => getContext(),
		tryGet: () => tryGetContext(),
	}) as unknown as ContextStoragePlugin<App>;
}
