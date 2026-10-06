import { child, type Location } from '../../loader/location';
import { isObject } from '../../util';
import { extraKeys } from '../keywords';
import type { Additional, ObjectNode, Property, SchemaNode } from '../types';
import type { SchemaState } from './state';
import { strings } from './vocabulary';

type ObjectState = Pick<
	SchemaState,
	'diagnostics' | 'node' | 'requiring' | 'undeclared'
>;

/** `type: object`: its `properties`, its extra keys, and what it requires. */
export function objectNode(
	state: ObjectState,
	s: Record<string, unknown>,
	at: Location,
): SchemaNode {
	const required = new Set(strings(s['required']));
	const properties: Property[] = [];
	if (isObject(s['properties'])) {
		for (const [name, value] of Object.entries(s['properties'])) {
			properties.push({
				name,
				required: required.has(name),
				schema: state.node(value, child(at, 'properties', name)),
			});
		}
	} else if (s['properties'] !== undefined) {
		state.diagnostics.error(
			'invalid_schema',
			'`properties` must be an object',
			child(at, 'properties'),
		);
	}
	const extra = extraKeys(s);
	const additional = additionalOf(state, s[extra], child(at, extra));
	for (const key of ['minProperties', 'maxProperties']) {
		if (key in s) {
			state.diagnostics.warning(
				'not_enforced',
				`\`${key}\` is not enforced`,
				child(at, key),
			);
		}
	}
	// `required` may name a key no property here declares: an `allOf`
	// sibling's, a parent's, or nobody's. `checkRequires` settles it.
	const undeclared = [...required].filter(
		(name) => !properties.some((p) => p.name === name),
	);
	if (undeclared.length > 0) {
		const node: ObjectNode = {
			kind: 'object',
			properties,
			additional,
			extends: [],
			requires: undeclared,
		};
		state.requiring.set(node, child(at, 'required'));
		return node;
	}
	if (properties.length === 0) {
		if (typeof additional === 'object') {
			return { kind: 'record', values: additional.schema };
		}
		// An object that declares nothing accepts anything; stripping unknown
		// keys would hand the handler an empty object.
		if (additional !== 'strict') {
			const record: SchemaNode = {
				kind: 'record',
				values: { kind: 'unknown' },
			};
			if (additional === 'default') state.undeclared.add(record);
			return record;
		}
	}
	return { kind: 'object', properties, additional, extends: [] };
}

function additionalOf(
	state: Pick<SchemaState, 'node'>,
	value: unknown,
	at: Location,
): Additional {
	if (value === undefined) return 'default';
	if (value === false) return 'strict';
	if (value === true || (isObject(value) && Object.keys(value).length === 0)) {
		return 'loose';
	}
	return { schema: state.node(value, at) };
}
