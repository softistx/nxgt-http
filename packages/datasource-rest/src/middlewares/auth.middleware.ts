import type { Middleware } from 'openapi-fetch';

export type AuthMiddlewareOptions = {
	token?: string | (() => Promise<string>);
	shouldUseToken?: (request: Request) => boolean;
};

export const authMiddleware = (options: AuthMiddlewareOptions): Middleware => ({
	onRequest({ request }) {
		if (!options.token) {
			return;
		}
		if (options.shouldUseToken && !options.shouldUseToken(request)) {
			return;
		}
		request.headers.set(
			'Authorization',
			`Bearer ${typeof options.token === 'function' ? options.token() : options.token}`,
		);
	},
});
