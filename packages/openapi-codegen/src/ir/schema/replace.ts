import type { SchemaNode } from '../types';

/** Rewrites `target` in place, keeping what it was annotated with. */
export function replaceNode(target: SchemaNode, next: SchemaNode): void {
	const { nullable, description, deprecated, readOnly, writeOnly } = target;
	const kept = Object.fromEntries(
		Object.entries({
			nullable,
			description,
			deprecated,
			readOnly,
			writeOnly,
			default: target.default,
		}).filter(([, value]) => value !== undefined),
	);
	const record = target as unknown as Record<string, unknown>;
	for (const key of Object.keys(record)) delete record[key];
	Object.assign(target, next, kept);
}
