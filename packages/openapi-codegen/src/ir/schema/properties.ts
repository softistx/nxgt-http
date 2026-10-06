import type { ObjectNode, Property } from '../types';
import type { SchemaState } from './state';

/** What looking a property up through `extends` reads. */
export type LookupState = Pick<SchemaState, 'named' | 'resolve'>;

/** A property one of the parents of `object` declares. */
export function inherited(
	state: LookupState,
	object: ObjectNode,
	name: string,
): Property | undefined {
	for (const id of object.extends) {
		const parent = state.named.get(id);
		const resolved = parent && state.resolve(parent.node);
		if (resolved?.kind !== 'object') continue;
		const found = propertyOf(state, resolved, name);
		if (found) return found;
	}
	return undefined;
}

/** A property of `object`, its own or one it extends. */
export function propertyOf(
	state: LookupState,
	object: ObjectNode,
	name: string,
	seen = new Set<string>(),
): Property | undefined {
	const own = object.properties.find((p) => p.name === name);
	if (own) return own;
	for (const id of object.extends) {
		if (seen.has(id)) continue;
		seen.add(id);
		const parent = state.named.get(id);
		const resolved = parent && state.resolve(parent.node);
		if (resolved?.kind !== 'object') continue;
		const found = propertyOf(state, resolved, name, seen);
		if (found) return found;
	}
	return undefined;
}
