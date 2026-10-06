/**
 * The state of one Api: its table, its index by route, and the operations
 * that have a route. Every part takes it as an argument.
 */
import type { OperationTable, RuntimeOperation } from '../engine';
import { unroutable } from '../routable';
import type { Placed, Running } from './types';

export interface Registry {
	readonly operations: OperationTable;
	/** `'<method> <path>'` to its `operationId`. */
	readonly byRoute: ReadonlyMap<string, string>;
	/** The operations registered so far. */
	readonly done: Set<string>;
	/** Shared by every Api: the route each request runs. */
	readonly running: Running;
	/** Shared by every Api: the routes put on each app, for the shadowing check. */
	readonly placed: Placed;
}

export function createRegistry(
	operations: OperationTable,
	running: Running,
	placed: Placed,
): Registry {
	const byRoute = new Map<string, string>();
	for (const [id, operation] of Object.entries(operations)) {
		byRoute.set(`${operation.method} ${operation.path}`, id);
	}
	return { operations, byRoute, done: new Set(), running, placed };
}

/** How a message names an operation: its id, method and path. */
export const label = (id: string, operation: RuntimeOperation): string =>
	`${id} (${operation.method.toUpperCase()} ${operation.path})`;

/**
 * The operations, with `tag` if given, that have no route yet. One `routes`
 * cannot register is never missing: the generator warned about it, and the
 * app serves it some other way.
 */
export function missing(registry: Registry, tag?: string): string[] {
	return Object.entries(registry.operations)
		.filter(
			([id, operation]) =>
				!registry.done.has(id) &&
				unroutable(operation) === undefined &&
				(tag === undefined || operation.tags.includes(tag)),
		)
		.map(([id]) => id);
}

/** Throws, listing them, when an operation has no route. */
export function assertComplete(registry: Registry, tag?: string): void {
	const left = missing(registry, tag);
	if (left.length === 0) return;
	throw new Error(
		`${left.length} operation(s)${tag === undefined ? '' : ` tagged ${tag}`} have no route:\n${left
			.map(
				(id) => `  ${label(id, registry.operations[id] as RuntimeOperation)}`,
			)
			.join('\n')}`,
	);
}
