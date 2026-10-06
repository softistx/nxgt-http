import { child, type Location } from '../../loader/location';
import { asString, isObject, without } from '../../util';
import type { SchemaNode, UnionNode } from '../types';
import type { SchemaState } from './state';
import { ANNOTATION_KEYS, UNSUPPORTED_KEYWORDS } from './vocabulary';

/** What may sit next to `oneOf` or `anyOf`, applied on top of the variant that matches. */
const BESIDE_UNION = new Set([
	'properties',
	'additionalProperties',
	'items',
	'required',
	'minProperties',
	'maxProperties',
]);

/** `oneOf` or `anyOf`, with what sits beside it. */
export function unionNode(
	state: Pick<
		SchemaState,
		'diagnostics' | 'node' | 'structure' | 'besideUnion' | 'discriminators'
	>,
	s: Record<string, unknown>,
	at: Location,
): SchemaNode {
	const key = Array.isArray(s['oneOf']) ? 'oneOf' : 'anyOf';
	if (Array.isArray(s['oneOf']) && Array.isArray(s['anyOf'])) {
		state.diagnostics.error(
			'unsupported_keyword',
			'`oneOf` and `anyOf` together are not supported',
			child(at, 'anyOf'),
		);
	}
	const variants: SchemaNode[] = [];
	let nullable = false;
	for (const [index, value] of (s[key] as unknown[]).entries()) {
		const variant = state.node(value, child(at, key, index));
		if (variant.kind === 'null') nullable = true;
		else variants.push(variant);
	}

	let node: SchemaNode;
	const [only] = variants;
	if (!only) node = { kind: 'null' };
	else if (variants.length === 1) node = only;
	else {
		const union: UnionNode = {
			kind: 'union',
			variants,
			exclusive: key === 'oneOf',
		};
		const property = isObject(s['discriminator'])
			? asString(s['discriminator']['propertyName'])
			: undefined;
		if (property !== undefined) {
			union.discriminator = property;
			state.discriminators.set(union, child(at, 'discriminator'));
		}
		node = union;
	}
	if (nullable && node.kind !== 'null') node.nullable = true;

	// Keywords next to the variants apply on top of whichever one matches.
	const base = without(
		s,
		(k) =>
			k === 'oneOf' ||
			k === 'anyOf' ||
			k === 'discriminator' ||
			k === 'unevaluatedProperties' ||
			ANNOTATION_KEYS.has(k) ||
			k.startsWith('x-') ||
			UNSUPPORTED_KEYWORDS.includes(k),
	);
	for (const name of Object.keys(base)) {
		if (name === 'type' || BESIDE_UNION.has(name)) continue;
		state.diagnostics.error(
			'unsupported_keyword',
			`\`${name}\` next to \`${key}\` is not supported: write it in each variant`,
			child(at, name),
		);
	}
	if (Object.keys(base).some((name) => BESIDE_UNION.has(name))) {
		const structure = state.structure(base, at);
		if (structure.kind === 'object' && node.kind === 'union') {
			state.besideUnion.set(structure, node);
		}
		return { kind: 'intersection', members: [structure, node] };
	}
	return node;
}
