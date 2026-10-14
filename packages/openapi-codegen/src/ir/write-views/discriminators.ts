/**
 * A union's discriminator is how a server tells its variants apart, so a
 * `readOnly` mark on it must not remove it from what a client sends: it is
 * kept, with a warning. This step records which properties are kept.
 */
import type { ObjectNode, SchemaNode } from '../types';
import { isReadOnly, type WriteContext } from './context';
import { children } from './reach';

/** Records every union discriminator of what the bodies reach. */
export function keepDiscriminators(ctx: WriteContext): void {
	const warned = new Set<string>();
	for (const { schema } of ctx.bodies) scan(ctx, schema, warned);
	for (const id of ctx.byBodies) {
		const schema = ctx.named.get(id);
		if (schema) scan(ctx, schema.node, warned);
	}
}

function scan(ctx: WriteContext, node: SchemaNode, warned: Set<string>): void {
	if (node.kind === 'union' && node.discriminator !== undefined) {
		for (const variant of node.variants) {
			if (variant.kind === 'ref') {
				protect(ctx, variant.target, node.discriminator, warned, new Set());
			} else if (variant.kind === 'object') {
				protectIn(
					ctx,
					undefined,
					variant,
					node.discriminator,
					warned,
					new Set(),
				);
			}
		}
	}
	for (const child of children(node)) scan(ctx, child, warned);
}

function protect(
	ctx: WriteContext,
	id: string,
	name: string,
	warned: Set<string>,
	seen: Set<string>,
): void {
	if (seen.has(id)) return;
	seen.add(id);
	const schema = ctx.named.get(id);
	if (schema?.node.kind !== 'object') return;
	protectIn(ctx, schema, schema.node, name, warned, seen);
}

function protectIn(
	ctx: WriteContext,
	schema:
		| {
				id: string;
				location: Parameters<WriteContext['diagnostics']['warning']>[2];
		  }
		| undefined,
	object: ObjectNode,
	name: string,
	warned: Set<string>,
	seen: Set<string>,
): void {
	const own = object.properties.find((p) => p.name === name);
	if (own) {
		const set = ctx.kept.get(object) ?? new Set<string>();
		set.add(name);
		ctx.kept.set(object, set);
		const key = `${schema?.id}:${name}`;
		if (isReadOnly(ctx, own.schema) && !warned.has(key)) {
			warned.add(key);
			ctx.diagnostics.warning(
				'ignored',
				`\`${name}\` is the discriminator of a union and \`readOnly\`: kept in what a client sends`,
				schema?.location,
			);
		}
	}
	for (const parent of object.extends) protect(ctx, parent, name, warned, seen);
}
