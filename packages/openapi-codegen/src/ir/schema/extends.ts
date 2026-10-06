import type { SchemaNode } from '../types';
import { meet } from './meet';
import { inherited, type LookupState, propertyOf } from './properties';
import { replaceNode } from './replace';
import { notChecked } from './requires';
import type { SchemaState } from './state';

/** `extends` only works on object parents; anything else becomes an intersection. */
export function checkExtends(
	state: LookupState & Pick<SchemaState, 'diagnostics' | 'composed'>,
): void {
	for (const [node, at] of state.composed) {
		if (node.kind !== 'object') continue;
		const usable = node.extends.every((id) => {
			const parent = state.named.get(id);
			return (
				parent !== undefined &&
				!parent.node.nullable &&
				state.resolve(parent.node).kind === 'object'
			);
		});
		if (usable) {
			// A property a parent declares too: the value meets both, and
			// what the parent requires stays required.
			for (const property of node.properties) {
				const found = inherited(state, node, property.name);
				if (!found) continue;
				if (found.required) property.required = true;
				property.schema = meet(found.schema, property.schema);
			}
			if (node.requires) {
				const unchecked = node.requires.filter(
					(name) => propertyOf(state, node, name) === undefined,
				);
				node.requires = node.requires.filter(
					(name) => !unchecked.includes(name),
				);
				if (node.requires.length === 0) delete node.requires;
				notChecked(state, unchecked, at);
			}
			continue;
		}
		// A parent that is not an object: an intersection, which still
		// requires what `required` names, copied from the parent declaring it.
		const properties = [...node.properties];
		const unchecked: string[] = [];
		for (const name of node.requires ?? []) {
			const found = inherited(state, node, name);
			if (found) properties.push({ ...found, required: true });
			else unchecked.push(name);
		}
		notChecked(state, unchecked, at);
		const members: SchemaNode[] = node.extends.map((target) => ({
			kind: 'ref',
			target,
		}));
		if (properties.length > 0 || node.additional !== 'default') {
			members.push({
				kind: 'object',
				properties,
				additional: node.additional,
				extends: [],
			});
		}
		replaceNode(node, { kind: 'intersection', members });
	}
}
