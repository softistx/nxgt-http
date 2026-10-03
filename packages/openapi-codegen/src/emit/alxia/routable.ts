/**
 * What alxia's router (`compilePath` in `@alxia/core`'s `router/router.ts`)
 * refuses, so `alxia.ts` leaves it out with a warning instead of writing a
 * route `app.route()` would throw on. A deliberate copy of alxia's rules: the
 * generator does not depend on alxia. Change it when alxia's router changes.
 */
import type { HttpMethod, OperationIR } from '../../ir/types';

/** The methods alxia routes, as it spells them: it has no TRACE. */
export const METHODS: Partial<Record<HttpMethod, string>> = {
	get: 'GET',
	put: 'PUT',
	post: 'POST',
	delete: 'DELETE',
	options: 'OPTIONS',
	head: 'HEAD',
	patch: 'PATCH',
	query: 'QUERY',
};

/** The statuses alxia's `StatusCode` names: a route declaring another does not compile. */
export const STATUSES = new Set([
	100, 101, 102, 103, 200, 201, 202, 203, 204, 205, 206, 207, 208, 226, 300,
	301, 302, 303, 304, 307, 308, 400, 401, 402, 403, 404, 405, 406, 407, 408,
	409, 410, 411, 412, 413, 414, 415, 416, 417, 418, 421, 422, 423, 424, 425,
	426, 428, 429, 431, 451, 500, 501, 502, 503, 504, 505, 506, 507, 508, 510,
	511,
]);

/** What alxia's router takes as a parameter name. */
const PARAM_NAME = /^[A-Za-z_$][\w$]*$/;

/** Why alxia cannot route the operation, if it cannot: `shapes` holds the paths of those kept. */
export function unroutable(
	operation: OperationIR,
	shapes: Map<string, string>,
): string | undefined {
	if (METHODS[operation.method] === undefined) {
		return `alxia has no ${operation.method.toUpperCase()} routes`;
	}
	const segments = operation.path.split('/').slice(1);
	const mixed = segments.find(
		(segment) => segment.includes('{') && !/^\{[^{}]+\}$/.test(segment),
	);
	if (mixed !== undefined) {
		return `alxia cannot route ${operation.path}: a path parameter must fill its whole segment, and ${mixed} does not`;
	}
	const names = new Set<string>();
	for (const segment of segments) {
		const name = /^\{([^{}]+)\}$/.exec(segment)?.[1];
		if (name !== undefined && names.has(name)) {
			return `alxia cannot route ${operation.path}: it declares :${name} twice`;
		}
		if (name !== undefined) names.add(name);
		if (name !== undefined && !PARAM_NAME.test(name)) {
			return `alxia cannot route ${operation.path}: :${name} is not a parameter name it reads. Name it with letters, digits and _`;
		}
		if (name === undefined && (segment.startsWith(':') || segment === '*')) {
			return `alxia cannot route ${operation.path}: it would read ${segment} as a parameter`;
		}
	}
	const earlier = shapes.get(shapeOf(operation.path));
	if (earlier !== undefined && earlier !== operation.path) {
		return `alxia cannot route ${operation.path} beside ${earlier}: the two match the same requests with other parameter names. Name the parameters alike`;
	}
	return undefined;
}

/** The path with its parameter names erased: alxia refuses two paths of one shape with other names. */
export const shapeOf = (path: string): string =>
	path.replace(/\{[^{}]+\}/g, ':');
