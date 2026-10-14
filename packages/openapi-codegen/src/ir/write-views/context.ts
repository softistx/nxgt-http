/**
 * What every step of the write-views pass shares: the named schemas, the
 * request bodies, which schemas they and the rest of the API reach, and the
 * two sets the steps fill in — the discriminators kept and the schemas that
 * differ for writing.
 */
import type { Diagnostics } from '../../errors';
import type {
	MediaIR,
	NamedSchema,
	ObjectNode,
	OperationIR,
	SchemaNode,
} from '../types';

export interface BodySchema {
	operation: OperationIR;
	media: MediaIR;
	schema: SchemaNode;
}

export interface WriteContext {
	named: ReadonlyMap<string, NamedSchema>;
	diagnostics: Diagnostics;
	bodies: BodySchema[];
	/** Schemas some request body reaches. */
	byBodies: Set<string>;
	/** Schemas something other than a (writable) request body reaches. */
	elsewhere: Set<string>;
	/** Bodies that are themselves `readOnly`: kept whole. */
	blocked: Set<string>;
	/** Per object, the property names a `readOnly` mark must not remove. */
	kept: WeakMap<ObjectNode, Set<string>>;
	/** Schemas that differ for writing. */
	differing: Set<string>;
}

/** Whether a node, or the schema it points at, is marked `readOnly`. */
export function isReadOnly(
	ctx: Pick<WriteContext, 'named'>,
	node: SchemaNode,
): boolean {
	let current = node;
	for (let hops = 0; hops < 64; hops++) {
		if (current.readOnly === true) return true;
		if (current.kind !== 'ref') return false;
		const target = ctx.named.get(current.target);
		if (!target) return false;
		current = target.node;
	}
	return false;
}

/** Whether the write view leaves this property of `object` out. */
export function isDropped(
	ctx: WriteContext,
	object: ObjectNode,
	name: string,
	schema: SchemaNode,
): boolean {
	return isReadOnly(ctx, schema) && !ctx.kept.get(object)?.has(name);
}
