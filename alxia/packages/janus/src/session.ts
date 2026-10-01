import {
	type Alxia,
	alxia,
	type Empty,
	type Reply,
	type ResponseSettings,
	withHeaders,
} from '@alxia/core';
import type { Authenticated, Session, SharedApi } from '@nxgt/janus';
import { type DeviceCookieOptions, sendDevice } from './device';

/** Anything `janus()` answered: the part of it this package calls. */
export type Auth<U extends { readonly type: string }> = Pick<
	SharedApi<U>,
	'authenticate' | 'signOut' | 'cookie'
>;

/** The users an `auth` instance knows, as a union narrowed by `user.type`. */
export type UserOfAuth<A> = A extends Auth<infer U> ? U : never;

export interface SessionOptions<T extends string> {
	/** Only a user of this type is authenticated here; any other is anonymous. */
	readonly type?: T;
	/**
	 * `true`: an anonymous request is answered 401 and the route never runs,
	 * so `user` is never `null` in it — and the 401 is in its type. Only a
	 * literal `true` types it so.
	 */
	readonly required?: boolean;
}

/** The body of the 401 a required session answers. */
export interface UnauthenticatedBody {
	readonly error: 'unauthenticated';
}

type UserOf<A, T> = Extract<UserOfAuth<A>, { readonly type: T }>;

/**
 * Who a request belongs to, as a plugin: `auth.authenticate(request)`, and
 * the routes declared after it read `user` and `session` — typed by the
 * user schema, narrowed by `type`.
 *
 * **An outage is not anonymous**: a store that cannot answer throws
 * `STORE_FAILED`, which `janusErrors()` answers 503, never 401.
 *
 * A session renewed in passing is sent again as a cookie, after the route —
 * only to a request that presented it as one (a `Bearer` client is never
 * handed a cookie), and never over a session cookie the route set itself.
 *
 * ```ts
 * app.use(session(auth, { required: true })).get('/me', ({ user, reply }) => reply(200, user));
 * ```
 */
export function session<
	A extends Auth<{ readonly type: string }>,
	const T extends UserOfAuth<A>['type'] = UserOfAuth<A>['type'],
>(
	auth: A,
	options: SessionOptions<T> & { readonly required: true },
): Alxia<
	{ readonly user: UserOf<A, T>; readonly session: Session },
	Empty,
	'',
	Reply<401, UnauthenticatedBody>
>;
export function session<
	A extends Auth<{ readonly type: string }>,
	const T extends UserOfAuth<A>['type'] = UserOfAuth<A>['type'],
>(
	auth: A,
	options?: SessionOptions<T> & { readonly required?: false },
): Alxia<
	{ readonly user: UserOf<A, T> | null; readonly session: Session | null },
	Empty,
	'',
	never
>;
export function session(
	auth: Auth<{ readonly type: string }>,
	options: SessionOptions<string> = {},
): unknown {
	const current = new WeakMap<
		Request,
		Authenticated<{ readonly type: string }> | null
	>();
	const unauthenticated: UnauthenticatedBody = { error: 'unauthenticated' };
	return alxia()
		.derive(async ({ request, reply }) => {
			const found = await auth.authenticate(
				request,
				options.type === undefined ? undefined : { type: options.type },
			);
			current.set(request, found);
			if (found === null && options.required === true) {
				return reply(401, unauthenticated);
			}
			return { user: found?.user ?? null, session: found?.session ?? null };
		})
		.wrap(async ({ request }, next) => {
			const response = await next();
			const found = current.get(request);
			if (found?.renewed !== true) return response;
			// The route's own cookie wins: a sign-in or a sign-out behind this
			// plugin must not be undone by the session it replaced.
			const name = `${auth.cookie.name}=`;
			const presented = new Bun.CookieMap(
				request.headers.get('cookie') ?? '',
			).get(auth.cookie.name);
			if (
				presented !== found.token ||
				response.headers.getSetCookie().some((value) => value.startsWith(name))
			) {
				return response;
			}
			return withHeaders(response, (headers) =>
				headers.append(
					'set-cookie',
					auth.cookie.serialize(found.token, found.session),
				),
			);
		});
}

/** What `sendSession` takes besides: the device cookie's options. */
export interface SendSessionOptions {
	readonly device?: DeviceCookieOptions;
}

/**
 * Sends the session cookie — after `signUp`, `signIn`, anything that
 * answered a token and its session — and answers the user. The token is in
 * the cookie, never in the body. With a `deviceToken`, the device cookie
 * too.
 *
 * ```ts
 * const signedIn = await auth.signIn(body, { device: deviceOf(ctx) });
 * return reply(200, { id: sendSession(ctx, auth, signedIn).id });
 * ```
 */
export function sendSession<U>(
	ctx: { readonly set: ResponseSettings },
	auth: Pick<Auth<{ readonly type: string }>, 'cookie'>,
	signedIn: {
		readonly token: string;
		readonly session: Session;
		readonly user: U;
		readonly deviceToken?: string | null;
	},
	options: SendSessionOptions = {},
): U {
	ctx.set.headers.append(
		'set-cookie',
		auth.cookie.serialize(signedIn.token, signedIn.session),
	);
	if (typeof signedIn.deviceToken === 'string') {
		sendDevice(ctx, signedIn.deviceToken, options.device);
	}
	return signedIn.user;
}

/**
 * Revokes the session the request presents and clears the cookie — cleared
 * whatever the answer, so a browser holding a stale cookie drops it too.
 */
export async function signOut(
	ctx: { readonly request: Request; readonly set: ResponseSettings },
	auth: Pick<Auth<{ readonly type: string }>, 'signOut' | 'cookie'>,
): Promise<boolean> {
	const revoked = await auth.signOut(ctx.request);
	ctx.set.headers.append('set-cookie', auth.cookie.clear());
	return revoked;
}
