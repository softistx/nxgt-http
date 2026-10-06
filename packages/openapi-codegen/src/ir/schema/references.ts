import { child, type Location } from '../../loader/location';
import { settledByAdditional } from '../keywords';
import type { SchemaNode } from '../types';
import { combine } from './all-of';
import { annotate, refuseUnsupported } from './annotations';
import { seal } from './sealing';
import type { SchemaState } from './state';
import { ANNOTATION_KEYS, without } from './vocabulary';

/** A `$ref`: a `ref` node, met with whatever else sits beside it. */
export function reference(
	state: SchemaState,
	s: Record<string, unknown>,
	at: Location,
): SchemaNode {
	// A $ref that is not a string was refused by the loader already.
	if (typeof s['$ref'] !== 'string') return { kind: 'unknown' };
	const target = state.register(
		state.resolver.deref({ $ref: s['$ref'] }, at),
		undefined,
		'ref',
	);
	const ref: SchemaNode = { kind: 'ref', target };
	const rest = without(
		s,
		(key) =>
			key === '$ref' || key === 'unevaluatedProperties' || key.startsWith('x-'),
	);
	refuseUnsupported(state, rest, at);
	let node: SchemaNode;
	if (Object.keys(rest).every((key) => ANNOTATION_KEYS.has(key))) {
		node = annotate(state, ref, rest, at);
	} else {
		// In 3.1 a $ref next to other keywords applies both, as allOf would.
		const own = without(rest, (key) => ANNOTATION_KEYS.has(key));
		node = annotate(
			state,
			combine(state, [ref, state.structure(own, at)], [], at),
			rest,
			at,
		);
	}
	if ('unevaluatedProperties' in s && !settledByAdditional(s)) {
		seal(
			state,
			node,
			s['unevaluatedProperties'],
			child(at, 'unevaluatedProperties'),
		);
	}
	return node;
}
