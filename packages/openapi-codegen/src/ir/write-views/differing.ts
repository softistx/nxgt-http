/**
 * Which schemas differ for writing: an object with a property to leave out,
 * or one that reaches such a schema through a `$ref`, `extends`, a list, a
 * record, a union or an intersection — found to a fixpoint, since schemas
 * reach each other in cycles.
 */
import type { SchemaNode } from '../types';
import { isDropped, type WriteContext } from './context';

/** Whether the node would change in a write view, given the schemas found so far. */
export function differs(ctx: WriteContext, node: SchemaNode): boolean {
	switch (node.kind) {
		case 'ref':
			return ctx.differing.has(node.target);
		case 'array':
			return differs(ctx, node.items);
		case 'record':
			return differs(ctx, node.values);
		case 'union':
			return node.variants.some((v) => differs(ctx, v));
		case 'intersection':
			return node.members.some((m) => differs(ctx, m));
		case 'object':
			return (
				node.extends.some((id) => ctx.differing.has(id)) ||
				node.properties.some(
					(p) =>
						isDropped(ctx, node, p.name, p.schema) || differs(ctx, p.schema),
				) ||
				(typeof node.additional === 'object' &&
					differs(ctx, node.additional.schema))
			);
		default:
			return false;
	}
}

/** Fills `ctx.differing` with the schemas the bodies reach that differ. */
export function findDiffering(ctx: WriteContext): void {
	for (let changed = true; changed; ) {
		changed = false;
		for (const id of ctx.byBodies) {
			const schema = ctx.named.get(id);
			if (!schema || ctx.blocked.has(id) || ctx.differing.has(id)) continue;
			if (!differs(ctx, schema.node)) continue;
			ctx.differing.add(id);
			changed = true;
		}
	}
}
