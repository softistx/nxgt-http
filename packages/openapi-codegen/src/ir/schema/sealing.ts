import type { Location } from '../../loader/location';
import type { SchemaNode } from '../types';
import { replaceNode } from './replace';
import type { SchemaState } from './state';

/**
 * `unevaluatedProperties: false`: a key no part of the schema evaluates is
 * refused. An object in the default mode becomes strict, and one whose
 * extra keys are allowed or have a schema evaluates them all already. A
 * union or an intersection seals its inline members and is marked
 * `sealed`: its `$ref` members cannot be changed here, and the emitter
 * warns when one of them accepts keys it does not declare.
 */
export function seal(
	state: Pick<SchemaState, 'diagnostics' | 'undeclared'>,
	node: SchemaNode,
	value: unknown,
	at: Location,
): void {
	if (value === true) return;
	if (value !== false) {
		state.diagnostics.error(
			'unsupported_keyword',
			'`unevaluatedProperties` with a schema is supported only where it reads the keys `additionalProperties` would: not next to `$ref`, `allOf`, `anyOf` or `oneOf`. Write `additionalProperties` beside it instead',
			at,
		);
		return;
	}
	if (node.kind === 'unknown') {
		state.diagnostics.warning(
			'not_enforced',
			'`unevaluatedProperties: false` on a schema that declares nothing else is not enforced: give it `type: object` and its `properties`',
			at,
		);
		return;
	}
	const sealOne = (target: SchemaNode): void => {
		if (target.kind === 'object') {
			if (target.additional === 'default') target.additional = 'strict';
		} else if (target.kind === 'record' && state.undeclared.has(target)) {
			// It declares nothing, so sealed it accepts only `{}`.
			replaceNode(target, {
				kind: 'object',
				properties: [],
				additional: 'strict',
				extends: [],
			});
		} else if (target.kind === 'ref') {
			target.sealed = true;
		} else if (target.kind === 'union') {
			// A value may match several anyOf variants and use keys from each:
			// strict variants would refuse what the spec accepts.
			if (!target.exclusive) {
				state.diagnostics.error(
					'unsupported_keyword',
					'`unevaluatedProperties: false` over `anyOf` is not supported: a value that matches several variants may use keys from each. Use `oneOf`',
					at,
				);
				return;
			}
			target.sealed = true;
			target.variants.forEach(sealOne);
		} else if (target.kind === 'intersection') {
			target.sealed = true;
			target.members.forEach(sealOne);
		}
	};
	sealOne(node);
}
