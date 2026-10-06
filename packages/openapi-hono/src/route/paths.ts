/** Where a route sits on its app: under a prefix, and behind earlier routes. */
import type { RuntimeOperation } from '../engine';

/** The operation's Hono path on an app mounted at `prefix`. */
export function localPath(
	operation: RuntimeOperation,
	prefix: string | undefined,
	name: string,
): string {
	if (!prefix) return operation.honoPath;
	const mount = prefix.replace(/\{([^}]+)\}/g, ':$1').replace(/\/$/, '');
	const path = operation.honoPath;
	if (path !== mount && !path.startsWith(`${mount}/`)) {
		throw new Error(
			`${name}: its path ${operation.path} is not under the prefix ${prefix}`,
		);
	}
	return path.slice(mount.length) || '/';
}

/**
 * Whether a request for `later` would always reach `earlier` first: Hono
 * tries routes in the order they were registered, so `/employees/:id`
 * registered before `/employees/me` answers for it.
 */
export function shadows(earlier: string, later: string): boolean {
	const a = earlier.split('/');
	const b = later.split('/');
	if (a.length !== b.length) return false;
	for (const [i, segment] of a.entries()) {
		if (segment !== b[i] && !segment.startsWith(':')) return false;
	}
	return true;
}
