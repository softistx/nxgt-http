/**
 * Builds the write side: the node of a schema without what a client may not
 * send, and the list of named schemas with the stripped ones in place and the
 * copies (`<id>#write`, `<Name>Write`) right after their sources.
 */
import type { Location } from '../../loader/location';
import { emitOrder } from '../schema/order';
import type { NamedSchema, ObjectNode, SchemaNode } from '../types';
import { isDropped, type WriteContext } from './context';
import { differs } from './differing';

/** Whether responses or parameters need the schema as it is, so it is copied. */
export const copied = (ctx: WriteContext, id: string): boolean =>
	ctx.differing.has(id) && ctx.elsewhere.has(id);

const retarget = (ctx: WriteContext, id: string) =>
	copied(ctx, id) ? `${id}#write` : id;

/** The names a parent's dropped properties had, which `requires` can no longer ask for. */
function droppedNames(
	ctx: WriteContext,
	id: string,
	seen = new Set<string>(),
): Set<string> {
	const out = new Set<string>();
	const object = ctx.named.get(id)?.node;
	if (object?.kind !== 'object' || seen.has(id)) return out;
	seen.add(id);
	for (const p of object.properties) {
		if (isDropped(ctx, object, p.name, p.schema)) out.add(p.name);
	}
	for (const parent of object.extends) {
		for (const name of droppedNames(ctx, parent, seen)) out.add(name);
	}
	return out;
}

function writeObject(ctx: WriteContext, node: ObjectNode): ObjectNode {
	const own = new Set(node.properties.map((p) => p.name));
	const gone = new Set(
		node.extends
			.flatMap((id) => [...droppedNames(ctx, id)])
			.filter((name) => !own.has(name)),
	);
	for (const p of node.properties) {
		if (isDropped(ctx, node, p.name, p.schema)) gone.add(p.name);
	}
	const result: ObjectNode = {
		...node,
		properties: node.properties
			.filter((p) => !isDropped(ctx, node, p.name, p.schema))
			.map((p) => ({ ...p, schema: writeNode(ctx, p.schema) })),
		extends: node.extends.map((id) => retarget(ctx, id)),
	};
	if (typeof node.additional === 'object') {
		result.additional = { schema: writeNode(ctx, node.additional.schema) };
	}
	if (node.requires) {
		const requires = node.requires.filter((name) => !gone.has(name));
		if (requires.length > 0) result.requires = requires;
		else delete result.requires;
	}
	return result;
}

/** The node as a client may send it. A node that does not differ is returned as it is. */
export function writeNode(ctx: WriteContext, node: SchemaNode): SchemaNode {
	if (!differs(ctx, node)) return node;
	switch (node.kind) {
		case 'ref':
			return { ...node, target: retarget(ctx, node.target) };
		case 'array':
			return { ...node, items: writeNode(ctx, node.items) };
		case 'record':
			return { ...node, values: writeNode(ctx, node.values) };
		case 'union':
			return { ...node, variants: node.variants.map((v) => writeNode(ctx, v)) };
		case 'intersection':
			return { ...node, members: node.members.map((m) => writeNode(ctx, m)) };
		case 'object':
			return writeObject(ctx, node);
		default:
			return node;
	}
}

/**
 * Every named schema, copies included, in emit order. The input schemas are
 * cloned, as `emitOrder` marks `recursive` on what it orders.
 */
export function assemble(
	ctx: WriteContext,
	schemas: readonly NamedSchema[],
	taken: Map<string, Location>,
	collision: (name: string, source: NamedSchema, other: Location) => void,
): NamedSchema[] {
	const next = new Map<string, NamedSchema>();
	for (const schema of schemas) {
		if (!ctx.differing.has(schema.id)) {
			next.set(schema.id, { ...schema });
			continue;
		}
		const view = writeNode(ctx, schema.node);
		if (!copied(ctx, schema.id)) {
			next.set(schema.id, { ...schema, node: view });
			continue;
		}
		next.set(schema.id, { ...schema });
		const name = `${schema.name}Write`;
		const other = taken.get(name);
		if (other) collision(name, schema, other);
		else taken.set(name, schema.location);
		next.set(`${schema.id}#write`, {
			...schema,
			id: `${schema.id}#write`,
			name,
			node: view,
		});
	}
	return emitOrder(next);
}
