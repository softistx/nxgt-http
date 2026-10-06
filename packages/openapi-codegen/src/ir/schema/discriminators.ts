import type { UnionNode } from '../types';
import { type LookupState, propertyOf } from './properties';
import type { SchemaState } from './state';

/** Drops, with a warning, every `discriminator` that cannot pick a variant. */
export function checkDiscriminators(
	state: LookupState & Pick<SchemaState, 'diagnostics' | 'discriminators'>,
): void {
	for (const [union, at] of state.discriminators) {
		const property = union.discriminator;
		if (property === undefined) continue;
		const problem = discriminatorProblem(state, union, property);
		if (problem === undefined) continue;
		delete union.discriminator;
		state.diagnostics.warning(
			'discriminator_fallback',
			`discriminator \`${property}\` cannot pick a variant (${problem}); validated as a plain union, which tries each variant in turn`,
			at,
		);
	}
}

function discriminatorProblem(
	state: LookupState,
	union: UnionNode,
	property: string,
): string | undefined {
	const seen = new Set<string>();
	for (const [index, variant] of union.variants.entries()) {
		const object = state.resolve(variant);
		if (object.kind !== 'object') return `variant ${index} is not an object`;
		const found = propertyOf(state, object, property);
		if (!found) return `variant ${index} has no \`${property}\``;
		if (!found.required && !object.requires?.includes(property)) {
			return `\`${property}\` is optional in variant ${index}`;
		}
		const value = state.resolve(found.schema);
		if (value.kind !== 'literal' || value.nullable) {
			return `\`${property}\` is not a constant in variant ${index}`;
		}
		for (const literal of value.values) {
			const key = JSON.stringify(literal);
			if (seen.has(key)) return `two variants share ${key}`;
			seen.add(key);
		}
	}
	return undefined;
}
