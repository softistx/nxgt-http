import type { Middleware } from 'openapi-fetch';

const cache = new Map<string, { expiry: number; value: Response }>();
const getCacheKey = (request: Request) => `${request.method}:${request.url}`;

export type CacheMiddlewareOptions = {
	ttl?: number;
	shouldCachePostRequest?: (req: Request) => boolean;
};

export const cacheMiddleware = ({
	ttl = 5 * 60 * 1000, // default TTL: 5 minutes
	shouldCachePostRequest = (req) => req.url.includes('/search'),
}: CacheMiddlewareOptions = {}): Middleware => ({
	onRequest({ request }) {
		const key = getCacheKey(request);
		const cached = cache.get(key);
		if (cached && cached.expiry > Date.now()) {
			return cached.value.clone();
		}
		cache.delete(key);
	},
	onResponse({ request, response }) {
		if (response.ok) {
			if (request.method === 'POST' && !shouldCachePostRequest?.(request)) {
				return;
			}
			const key = getCacheKey(request);
			cache.set(key, {
				expiry: Date.now() + ttl,
				value: response.clone(),
			});
		}
	},
});
