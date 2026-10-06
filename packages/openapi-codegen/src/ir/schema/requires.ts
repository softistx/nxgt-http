import type { Location } from '../../loader/location';
import type { UnionNode } from '../types';
import { type LookupState, propertyOf } from './properties';
import { replaceNode } from './replace';
import type { SchemaState } from './state';

/** Says that these `required` names are not checked. */
export function notChecked(
	state: Pick<SchemaState, 'diagnostics'>,
	names: readonly string[],
	at: Location,
): void {
	if (names.length === 0) return;
	const list = names.map((name) => `\`${name}\``).join(', ');
	state.diagnostics.warning(
		'not_enforced',
		`\`required\` names ${list}, which no \`properties\` declares: whether the key is present is not checked. Declare it under \`properties\``,
		at,
	);
}

/**
 * `required` names that no `properties` declares, as `objectNode` found
 * them. A key `additionalProperties` gives a schema is a required
 * property of that schema; beside a union, a name every variant requires
 * already holds; any other is not checked, and a warning says so.
 */
export function checkRequires(
	state: LookupState &
		Pick<SchemaState, 'diagnostics' | 'requiring' | 'besideUnion'>,
): void {
	for (const [node, at] of state.requiring) {
		const union = state.besideUnion.get(node);
		const names = (node.requires ?? []).filter(
			(name) => !(union && everyVariantRequires(state, union, name)),
		);
		delete node.requires;
		const unchecked: string[] = [];
		for (const name of names) {
			if (typeof node.additional === 'object') {
				node.properties.push({
					name,
					required: true,
					schema: node.additional.schema,
				});
			} else if (node.additional === 'strict') {
				state.diagnostics.error(
					'invalid_schema',
					`\`${name}\` is required, yet no property declares it and no other key is allowed`,
					at,
				);
			} else unchecked.push(name);
		}
		notChecked(state, unchecked, at);
		// Nothing declared after all: an object of anything, as without `required`.
		if (
			node.properties.length === 0 &&
			(node.additional === 'default' || node.additional === 'loose')
		) {
			replaceNode(node, { kind: 'record', values: { kind: 'unknown' } });
		}
	}
}

function everyVariantRequires(
	state: LookupState,
	union: UnionNode,
	name: string,
): boolean {
	return union.variants.every((variant) => {
		const object = state.resolve(variant);
		if (object.kind !== 'object') return false;
		return (
			propertyOf(state, object, name)?.required === true ||
			object.requires?.includes(name) === true
		);
	});
}
