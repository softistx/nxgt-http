import { child, type Location } from '../../loader/location';
import { asNumber } from '../../util';
import type { ArrayNode, SchemaNode } from '../types';
import type { SchemaState } from './state';

/** `type: array`: its `items`, and the bounds on its length. */
export function arrayNode(
	state: Pick<SchemaState, 'diagnostics' | 'node'>,
	s: Record<string, unknown>,
	at: Location,
): SchemaNode {
	let items: SchemaNode = { kind: 'unknown' };
	if (Array.isArray(s['items'])) {
		state.diagnostics.error(
			'unsupported_keyword',
			'a list of `items` (a tuple) is not supported',
			child(at, 'items'),
		);
	} else if ('items' in s) items = state.node(s['items'], child(at, 'items'));
	const node: ArrayNode = { kind: 'array', items };
	const minItems = asNumber(s['minItems']);
	if (minItems !== undefined) node.minItems = minItems;
	const maxItems = asNumber(s['maxItems']);
	if (maxItems !== undefined) node.maxItems = maxItems;
	if (s['uniqueItems'] === true) {
		state.diagnostics.warning(
			'not_enforced',
			'`uniqueItems` is not enforced',
			child(at, 'uniqueItems'),
		);
	}
	return node;
}
