/**
 * Why `routes` cannot register an operation on Hono, if it cannot: the
 * generator warns. A deliberate copy of `@nxgt/openapi-hono`'s
 * `src/routable.ts`, whose runtime refuses the same route: importing it would
 * make the runtime a dependency of the generator. Change both together.
 */
export function unroutable(operation: {
	readonly method: string;
	readonly path: string;
}): string | undefined {
	if (operation.method === 'head') {
		return `Hono answers HEAD with the GET route of ${operation.path}, so a HEAD handler would never run. Register GET ${operation.path} instead`;
	}
	const mixed = operation.path
		.split('/')
		.find((segment) => segment.includes('{') && !/^\{[^{}]+\}$/.test(segment));
	if (mixed !== undefined) {
		return `Hono cannot route ${operation.path}: a path parameter must fill its whole segment, and ${mixed} does not. Serve it with app.on() and validate it yourself`;
	}
	return undefined;
}
