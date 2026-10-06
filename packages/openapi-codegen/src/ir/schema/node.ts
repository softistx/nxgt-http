import { child, type Location } from '../../loader/location';
import { isObject } from '../../util';
import { settledByAdditional } from '../keywords';
import type { SchemaNode } from '../types';
import { allOfNode } from './all-of';
import { annotate, refuseUnsupported } from './annotations';
import { enumOrConst } from './literals';
import { reference } from './references';
import { seal } from './sealing';
import type { SchemaState } from './state';
import { typedNode } from './typed';
import { unionNode } from './unions';

/** The node for the schema `value`, found at `at`. */
export function schemaNode(
	state: SchemaState,
	value: unknown,
	at: Location,
): SchemaNode {
	if (value === undefined || value === true) return { kind: 'unknown' };
	if (value === false) return { kind: 'never' };
	if (!isObject(value)) {
		state.diagnostics.error(
			'invalid_schema',
			'a schema must be an object or a boolean',
			at,
		);
		return { kind: 'unknown' };
	}
	if ('$ref' in value) return reference(state, value, at);
	refuseUnsupported(state, value, at);
	const node = annotate(state, structure(state, value, at), value, at);
	if ('unevaluatedProperties' in value && !settledByAdditional(value)) {
		seal(
			state,
			node,
			value['unevaluatedProperties'],
			child(at, 'unevaluatedProperties'),
		);
	}
	return node;
}

/** The shape `s` describes, by keyword family: composition, literal, then `type`. */
export function structure(
	state: SchemaState,
	s: Record<string, unknown>,
	at: Location,
): SchemaNode {
	if (Array.isArray(s['allOf'])) return allOfNode(state, s, at);
	if (Array.isArray(s['oneOf']) || Array.isArray(s['anyOf'])) {
		return unionNode(state, s, at);
	}
	return enumOrConst(state, s, at) ?? typedNode(state, s, at);
}
