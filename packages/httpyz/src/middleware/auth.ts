/**
 * A token on every request, and one refresh when a reply is 401: calls
 * refused together wait on the same refresh, then are sent again once, with
 * the new token.
 */
import type { Middleware } from './compose';

type Token = string | null | undefined;

export interface AuthOptions {
	/** The current token, read before each request. None sends no header. */
	token: () => Token | Promise<Token>;
	/**
	 * Gets a new token after a 401, for `token` to return. When it throws, or
	 * `token` still returns the refused one, the 401 is the reply, for the app
	 * to sign out on.
	 */
	refresh?: () => unknown;
	/** Default: `Bearer`. */
	scheme?: string;
}

/** The client's `auth`: one per client, so its calls share a refresh. */
export function auth({
	token,
	refresh,
	scheme = 'Bearer',
}: AuthOptions): Middleware {
	let refreshing: Promise<unknown> | undefined;
	const sign = (request: Request, value: Token): Request => {
		if (value) request.headers.set('authorization', `${scheme} ${value}`);
		return request;
	};
	return async (request, next) => {
		const used = await token();
		// Sent again after a refresh: its body can only be read once.
		const replay = refresh ? request.clone() : undefined;
		const response = await next(sign(request, used));
		if (response.status !== 401 || !replay || !refresh) return response;
		try {
			// A call refused with a token already replaced has nothing to refresh.
			if ((await token()) === used) {
				refreshing ??= Promise.resolve()
					.then(refresh)
					.finally(() => {
						refreshing = undefined;
					});
				await refreshing;
			}
		} catch {
			return response;
		}
		const fresh = await token();
		if (!fresh || fresh === used) return response;
		await response.body?.cancel();
		return next(sign(replay, fresh));
	};
}
