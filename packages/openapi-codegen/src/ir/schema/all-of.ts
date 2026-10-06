import { child, type Location } from '../../loader/location';
import type { ObjectNode, SchemaNode } from '../types';
import { meet } from './meet';
import type { SchemaState } from './state';
import { ANNOTATION_KEYS, strings, without } from './vocabulary';

type CombineState = Pick<SchemaState, 'diagnostics' | 'requiring' | 'composed'>;

/** `allOf`, with the keywords beside it as one more member. */
export function allOfNode(
	state: CombineState & Pick<SchemaState, 'node' | 'structure'>,
	s: Record<string, unknown>,
	at: Location,
): SchemaNode {
	const members = (s['allOf'] as unknown[]).map((value, index) =>
		state.node(value, child(at, 'allOf', index)),
	);
	const own = without(
		s,
		(k) =>
			k === 'allOf' ||
			k === 'type' ||
			// Sealed by `node()`, over the members and these keywords alike.
			k === 'unevaluatedProperties' ||
			ANNOTATION_KEYS.has(k) ||
			k.startsWith('x-'),
	);
	// `required` next to `allOf` names properties that live in a member.
	let requires: string[] = [];
	if ('required' in own && !('properties' in own)) {
		requires = strings(own['required']);
		delete own['required'];
	}
	if (Object.keys(own).length > 0) members.push(state.structure(own, at));
	return combine(state, members, requires, at);
}

/**
 * `allOf` over objects is one object that extends the named ones, so the
 * type is `interface X extends Base` and the validator `zBase.extend()`.
 * Anything else is an intersection.
 */
export function combine(
	state: CombineState,
	members: SchemaNode[],
	requires: string[],
	at: Location,
): SchemaNode {
	const [only] = members;
	if (only && members.length === 1 && requires.length === 0) return only;
	const objects = members.every(
		(member) =>
			!member.nullable && (member.kind === 'ref' || member.kind === 'object'),
	);
	if (!objects) {
		if (requires.length > 0) {
			state.diagnostics.warning(
				'not_enforced',
				'`required` next to an `allOf` that is not all objects is not enforced',
				child(at, 'required'),
			);
		}
		return { kind: 'intersection', members };
	}
	const node: ObjectNode = {
		kind: 'object',
		properties: [],
		additional: 'default',
		extends: [],
	};
	const wanted = [...requires];
	let strictMember = false;
	for (const member of members) {
		if (member.kind === 'ref') {
			node.extends.push(member.target);
			continue;
		}
		if (member.kind !== 'object') continue;
		// Its `required` names now go to the merged object, settled there.
		state.requiring.delete(member);
		node.extends.push(...member.extends);
		for (const property of member.properties) {
			const index = node.properties.findIndex((p) => p.name === property.name);
			const earlier = node.properties[index];
			if (!earlier) node.properties.push(property);
			else {
				// Every member holds, so a property two declare meets both.
				node.properties[index] = {
					name: property.name,
					required: earlier.required || property.required,
					schema: meet(earlier.schema, property.schema),
				};
			}
		}
		if (member.additional === 'strict' && members.length > 1) {
			strictMember = true;
		}
		if (member.additional !== 'default') node.additional = member.additional;
		wanted.push(...(member.requires ?? []));
	}
	if (strictMember) {
		state.diagnostics.warning(
			'not_enforced',
			'`additionalProperties: false` on an `allOf` member refuses, in JSON Schema, the keys the other members declare; merged into one object, they are accepted. To refuse only undeclared keys, write `unevaluatedProperties: false` next to the `allOf`',
			at,
		);
	}
	for (const name of wanted) {
		const own = node.properties.find((p) => p.name === name);
		if (own) own.required = true;
		else {
			node.requires ??= [];
			if (!node.requires.includes(name)) node.requires.push(name);
		}
	}
	state.composed.set(node, at);
	return node;
}
