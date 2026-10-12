import type { Diagnostic } from '../errors';
import type { SchemaNode } from '../ir/types';
import type { EmitContext } from './context';

/**
 * An `additionalProperties: false` on an `allOf` member that the generated
 * validator cannot keep. JSON Schema refuses every key that member does not
 * declare. A Zod intersection refuses a key only when every member does,
 * and `.extend()` takes the child's mode, so beside a member that strips
 * the extra keys are dropped instead.
 */
export function findLoosened(ctx: EmitContext): Diagnostic[] {
	const warnings: Diagnostic[] = [];
	const refuses = (node: SchemaNode, seen = new Set<SchemaNode>()): boolean => {
		const target = ctx.resolve(node);
		if (seen.has(target)) return true;
		seen.add(target);
		switch (target.kind) {
			case 'object':
				return ctx.mode(target) === 'strict';
			case 'union':
				return target.variants.every((v) => refuses(v, seen));
			case 'intersection':
				return target.members.some((m) => refuses(m, seen));
			case 'record':
			case 'unknown':
				// Any key goes.
				return false;
			default:
				return true;
		}
	};
	const said = (node: SchemaNode): boolean => {
		const target = ctx.resolve(node);
		return target.kind === 'object' && target.additional === 'strict';
	};
	for (const schema of ctx.ir.schemas) {
		let loosened = false;
		let unsealed = false;
		const visit = (node: SchemaNode): void => {
			if (node.kind === 'array') visit(node.items);
			else if (node.kind === 'record') visit(node.values);
			else if (node.kind === 'ref') {
				if (node.sealed && !refuses(node)) unsealed = true;
			} else if (node.kind === 'union') {
				if (node.sealed && !node.variants.every((v) => refuses(v))) {
					unsealed = true;
				}
				node.variants.forEach(visit);
			} else if (node.kind === 'intersection') {
				if (node.sealed && !node.members.every((m) => refuses(m))) {
					unsealed = true;
				}
				if (node.members.some(said) && !node.members.every((m) => refuses(m))) {
					loosened = true;
				}
				node.members.forEach(visit);
			} else if (node.kind === 'object') {
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
					: parents.every((p) => refuses(p)) && (strict || shapeless);
				if (parents.some(said) && !kept) loosened = true;
				for (const property of node.properties) visit(property.schema);
				if (typeof node.additional === 'object') {
					visit(node.additional.schema);
				}
			}
		};
		visit(schema.node);
		if (unsealed) {
			warnings.push({
				severity: 'warning',
				code: 'not_enforced',
				message: `${schema.name}: \`unevaluatedProperties: false\` is not enforced over a $ref member that accepts keys it does not declare: they are dropped, not refused. Give that member \`additionalProperties: false\`, or set \`unknownKeys: 'strict'\``,
				file: schema.location.file,
				pointer: schema.location.pointer,
			});
		}
		if (!loosened) continue;
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
