import type { Diagnostic } from '../errors';
import type { SchemaNode } from '../ir/types';
import type { EmitContext } from './context';

type Found = { loosened: boolean; unsealed: boolean };

/** Whether the node refuses a key it does not declare. */
function refuses(
	ctx: EmitContext,
	node: SchemaNode,
	seen = new Set<SchemaNode>(),
): boolean {
	const target = ctx.resolve(node);
	if (seen.has(target)) return true;
	seen.add(target);
	switch (target.kind) {
		case 'object':
			return ctx.mode(target) === 'strict';
		case 'union':
			return target.variants.every((v) => refuses(ctx, v, seen));
		case 'intersection':
			return target.members.some((m) => refuses(ctx, m, seen));
		case 'record':
		case 'unknown':
			// Any key goes.
			return false;
		default:
			return true;
	}
}

/** Whether the node says `additionalProperties: false` itself. */
function said(ctx: EmitContext, node: SchemaNode): boolean {
	const target = ctx.resolve(node);
	return target.kind === 'object' && target.additional === 'strict';
}

function visitIntersection(
	ctx: EmitContext,
	node: Extract<SchemaNode, { kind: 'intersection' }>,
	found: Found,
): void {
	const everyRefuses = node.members.every((m) => refuses(ctx, m));
	if (node.sealed && !everyRefuses) found.unsealed = true;
	if (node.members.some((m) => said(ctx, m)) && !everyRefuses) {
		found.loosened = true;
	}
	for (const member of node.members) visit(ctx, member, found);
}

function visitObject(
	ctx: EmitContext,
	node: Extract<SchemaNode, { kind: 'object' }>,
	found: Found,
): void {
	const parents = node.extends.map(
		(target): SchemaNode => ({ kind: 'ref', target }),
	);
	const strict = ctx.mode(node) === 'strict';
	// Without properties of its own, or of a parent's that `required`
	// restates, the object adds no member to the intersection.
	const shapeless =
		node.properties.length === 0 &&
		!(node.requires ?? []).some(
			(name) => ctx.propertyOf(node, name) !== undefined,
		);
	const kept = parents.every((p) => ctx.isZodObject(p))
		? strict
		: parents.every((p) => refuses(ctx, p)) && (strict || shapeless);
	if (parents.some((p) => said(ctx, p)) && !kept) found.loosened = true;
	for (const property of node.properties) visit(ctx, property.schema, found);
	if (typeof node.additional === 'object') {
		visit(ctx, node.additional.schema, found);
	}
}

function visit(ctx: EmitContext, node: SchemaNode, found: Found): void {
	if (node.kind === 'array') visit(ctx, node.items, found);
	else if (node.kind === 'record') visit(ctx, node.values, found);
	else if (node.kind === 'ref') {
		if (node.sealed && !refuses(ctx, node)) found.unsealed = true;
	} else if (node.kind === 'union') {
		if (node.sealed && !node.variants.every((v) => refuses(ctx, v))) {
			found.unsealed = true;
		}
		for (const variant of node.variants) visit(ctx, variant, found);
	} else if (node.kind === 'intersection') visitIntersection(ctx, node, found);
	else if (node.kind === 'object') visitObject(ctx, node, found);
}

/**
 * An `additionalProperties: false` on an `allOf` member that the generated
 * validator cannot keep. JSON Schema refuses every key that member does not
 * declare. A Zod intersection refuses a key only when every member does,
 * and `.extend()` takes the child's mode, so beside a member that strips
 * the extra keys are dropped instead.
 */
export function findLoosened(ctx: EmitContext): Diagnostic[] {
	const warnings: Diagnostic[] = [];
	for (const schema of ctx.ir.schemas) {
		const found: Found = { loosened: false, unsealed: false };
		visit(ctx, schema.node, found);
		if (found.unsealed) {
			warnings.push({
				severity: 'warning',
				code: 'not_enforced',
				message: `${schema.name}: \`unevaluatedProperties: false\` is not enforced over a $ref member that accepts keys it does not declare: they are dropped, not refused. Give that member \`additionalProperties: false\`, or set \`unknownKeys: 'strict'\``,
				file: schema.location.file,
				pointer: schema.location.pointer,
			});
		}
		if (!found.loosened) continue;
		warnings.push({
			severity: 'warning',
			code: 'not_enforced',
			message: `${schema.name}: \`additionalProperties: false\` on an allOf member is not enforced. A key it does not declare is dropped, not refused, when another member accepts it`,
			file: schema.location.file,
			pointer: schema.location.pointer,
		});
	}
	return warnings;
}
