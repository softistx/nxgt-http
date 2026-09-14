/**
 * Why `routes` cannot register an operation on Hono, if it cannot. Shared by
 * the runtime, which refuses the route, and by the generator, which warns.
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
