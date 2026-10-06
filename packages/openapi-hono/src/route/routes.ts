/**
 * The routes object `api.routes(app)` returns: a function per HTTP method,
 * `operation`, the `validate` marker, and `with`.
 */
import type { ApiOptions, Method } from '../types';
import { register, VALIDATE } from './register';
import type { Registry } from './registry';
import type { App, Settings } from './types';

const METHODS: readonly Method[] = [
	'get',
	'put',
	'post',
	'delete',
	'options',
	'head',
	'patch',
	'trace',
	'query',
];

export function makeRoutes(
	registry: Registry,
	app: App,
	settings: Settings,
): Record<string, unknown> {
	const routes: Record<string, unknown> = {
		validate: VALIDATE,
		with: (options: ApiOptions) =>
			makeRoutes(registry, app, { ...settings, ...options }),
		operation: (id: string, ...chain: unknown[]) => {
			register(registry, app, id, chain, settings);
			return routes;
		},
	};
	for (const method of METHODS) {
		routes[method] = (path: string, ...chain: unknown[]) => {
			const id = registry.byRoute.get(`${method} ${path}`);
			if (id === undefined) {
				throw new Error(
					`The spec has no ${method.toUpperCase()} ${path} operation`,
				);
			}
			register(registry, app, id, chain, settings);
			return routes;
		};
	}
	return routes;
}
