import { alxia, type BaseContext } from '@alxia/core';
import type {
	CheckableOf,
	CtxOf,
	FieldsOf,
	ModelConfig,
	ObjectTypeOf,
	Permissions,
	SubjectRef,
} from '@nxgt/janus/permissions';

/**
 * An object of type `T` as the application loads it: its id, every field a
 * `fromField` of its type reads, and whatever else it carries.
 */
export type ObjectData<C extends ModelConfig, T extends ObjectTypeOf<C>> = {
	readonly id: string;
} & { readonly [F in FieldsOf<C, T>]: string | null };

export type Awaitable<V> = V | Promise<V>;

/** The body of each refusal. */
export interface PermissionRefusedBody {
	readonly error: 'unauthenticated' | 'not_found' | 'forbidden';
}

/**
 * The options of `permission()`: `ctx` required exactly when a condition of
 * the permission is reachable, as for `can()`. `@nxgt/janus-hono`'s, over
 * alxia's context, kept twice on purpose.
 */
export type PermissionOptions<
	C extends ModelConfig,
	T extends ObjectTypeOf<C>,
	P extends string,
	O,
> = {
	/** Who asks. The `user` `session()` derived when absent. `null` is anonymous. */
	readonly subject?: (ctx: BaseContext) => Awaitable<SubjectRef<C> | null>;
} & ([CtxOf<C, T, P>] extends [never]
	? { readonly ctx?: never }
	: {
			/** The condition's context, read from the request and the loaded object. */
			readonly ctx: (ctx: BaseContext, object: O) => Awaitable<CtxOf<C, T, P>>;
		});

export type OptionsArgs<
	C extends ModelConfig,
	T extends ObjectTypeOf<C>,
	P extends string,
	O,
> = [ObjectTypeOf<C>] extends [T]
	? IsSingle<ObjectTypeOf<C>> extends true
		? PermissionArgs<C, T, P, O>
		: [options?: LooseOptions]
	: PermissionArgs<C, T, P, O>;

type PermissionArgs<
	C extends ModelConfig,
	T extends ObjectTypeOf<C>,
	P extends string,
	O,
> = [CheckableOf<C, T>] extends [P]
	? IsSingle<CheckableOf<C, T>> extends true
		? StrictArgs<C, T, P, O>
		: [options?: LooseOptions]
	: StrictArgs<C, T, P, O>;

type StrictArgs<
	C extends ModelConfig,
	T extends ObjectTypeOf<C>,
	P extends string,
	O,
> = [CtxOf<C, T, P>] extends [never]
	? [options?: PermissionOptions<C, T, P, O>]
	: [options: PermissionOptions<C, T, P, O>];

type LooseOptions = {
	readonly subject?: (ctx: BaseContext) => unknown;
	readonly ctx?: (ctx: BaseContext, object: never) => unknown;
};

type UnionToIntersection<U> = (
	U extends unknown
		? (union: U) => void
		: never
) extends (intersection: infer I) => void
	? I
	: never;

type IsSingle<U> = [U] extends [UnionToIntersection<U>] ? true : false;

type LooseCan = (
	subject: SubjectRef<ModelConfig> | null,
	permission: string,
	object: { readonly type: string; readonly id: string },
	options?: { readonly ctx: unknown },
) => Promise<boolean>;

/**
 * A guard, as a plugin: the routes declared after it run only if the
 * subject holds `permission` on an object of `type`. It loads the object
 * once, checks it with `access.can`, and hands it to them as `object`.
 *
 * | the request | answered |
 * | --- | --- |
 * | anonymous | 401 — before the object is loaded |
 * | `load` answers `null` | 404 |
 * | a denial | 403 |
 * | allowed | the route runs, `object` set |
 *
 * Each refusal is typed on those routes. **A failure throws**: a store that
 * cannot answer is `STORE_FAILED`, never a 403 — `janusErrors()` answers
 * it 503. Scope it with `group`, so it guards only its routes:
 *
 * ```ts
 * app.use(session(auth)).group('/records/:id', (records) =>
 *   records.use(permission(access, 'view', 'record', byParam('id', findRecord)))
 *     .get('/', ({ object, reply }) => reply(200, object)));
 * ```
 */
export function permission<
	C extends ModelConfig,
	const T extends ObjectTypeOf<C>,
	const P extends CheckableOf<C, T>,
	O extends ObjectData<C, T>,
>(
	access: Pick<Permissions<C>, 'can'>,
	permission: P,
	type: T,
	load: (ctx: BaseContext) => Awaitable<O | null>,
	...options: OptionsArgs<C, T, P, O>
) {
	const { subject, ctx: ctxOf } = (options[0] ?? {}) as {
		readonly subject?: (
			ctx: BaseContext,
		) => Awaitable<SubjectRef<ModelConfig> | null>;
		readonly ctx?: (ctx: BaseContext, object: unknown) => Awaitable<unknown>;
	};
	const can = access.can as LooseCan;
	const refuse = (error: PermissionRefusedBody['error']) => {
		const body: PermissionRefusedBody = { error };
		return body;
	};
	return alxia().derive(async (ctx) => {
		const who = subject === undefined ? userOf(ctx) : await subject(ctx);
		if (who === null) return ctx.reply(401, refuse('unauthenticated'));
		const object = await load(ctx);
		if (object === null) return ctx.reply(404, refuse('not_found'));
		const allowed = await can(
			who,
			permission,
			view(object, type),
			ctxOf === undefined ? undefined : { ctx: await ctxOf(ctx, object) },
		);
		if (!allowed) return ctx.reply(403, refuse('forbidden'));
		return { object };
	});
}

/**
 * A `load` reading one path parameter, as it arrived: `find(id)`, or `null`
 * — a 404 — when the route has no such parameter.
 */
export function byParam<O>(
	name: string,
	find: (id: string) => Awaitable<O | null>,
): (ctx: BaseContext) => Awaitable<O | null> {
	return (ctx) => {
		const id = ctx.pathParams[name];
		return id === undefined ? null : find(id);
	};
}

/** The object as `can()` reads it: `type` added, every other field read from the object itself. */
function view(
	object: object,
	type: string,
): { readonly type: string; readonly id: string } {
	return new Proxy(object, {
		get: (target, key) => (key === 'type' ? type : Reflect.get(target, key)),
		has: (target, key) => key === 'type' || Reflect.has(target, key),
	}) as { readonly type: string; readonly id: string };
}

/** The `user` `session()` derived — or a wiring error when nothing did. */
function userOf(ctx: BaseContext): SubjectRef<ModelConfig> | null {
	const user = (ctx as { readonly user?: unknown }).user;
	if (user === undefined) {
		throw new TypeError(
			'permission(): no user in the context — use session(auth) before it, or pass { subject }',
		);
	}
	return user as SubjectRef<ModelConfig> | null;
}
