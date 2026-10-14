/**
 * What every step of the views pass shares: the direction, the named
 * schemas, the roots (the request bodies, or the replies), which schemas
 * they and the rest of the API reach, and the two sets the steps fill in —
 * the discriminators kept and the schemas that differ for the direction.
 */
import type { Diagnostics } from '../../errors';
import type { NamedSchema, ObjectNode, SchemaNode } from '../types';
import type { Direction, Root } from './direction';

export interface ViewContext {
	direction: Direction;
	named: ReadonlyMap<string, NamedSchema>;
	diagnostics: Diagnostics;
	roots: Root[];
	/** Schemas some root reaches. */
	byRoots: Set<string>;
	/** Schemas something other than a root reaches. */
	elsewhere: Set<string>;
	/** Roots that are themselves marked: kept whole. */
	blocked: Set<string>;
	/** Per object, the property names the mark must not remove. */
	kept: WeakMap<ObjectNode, Set<string>>;
	/** Schemas that differ for the direction. */
	differing: Set<string>;
}

/** Whether a node, or the schema it points at, carries the direction's mark. */
export function isMarked(
	ctx: Pick<ViewContext, 'named' | 'direction'>,
	node: SchemaNode,
): boolean {
	let current = node;
	for (let hops = 0; hops < 64; hops++) {
		if (current[ctx.direction.mark] === true) return true;
		if (current.kind !== 'ref') return false;
		const target = ctx.named.get(current.target);
		if (!target) return false;
		current = target.node;
	}
	return false;
}

/** Whether the view leaves this property of `object` out. */
export function isDropped(
	ctx: ViewContext,
	object: ObjectNode,
	name: string,
	schema: SchemaNode,
): boolean {
	return isMarked(ctx, schema) && !ctx.kept.get(object)?.has(name);
}
