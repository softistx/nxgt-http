import { child, type Location } from '../../loader/location';
import { extraKeys } from '../keywords';
import type { SchemaNode } from '../types';
import { arrayNode } from './arrays';
import { objectNode } from './objects';
import { numberNode, stringNode } from './scalars';
import type { SchemaState } from './state';

type TypedState = Pick<
	SchemaState,
	'diagnostics' | 'warnedFormats' | 'node' | 'requiring' | 'undeclared'
>;

const JSON_TYPES = new Set([
	'string',
	'number',
	'integer',
	'boolean',
	'null',
	'array',
	'object',
]);

/** A schema neither composed nor a literal: what its `type`, or its other keywords, say it is. */
export function typedNode(
	state: TypedState,
	s: Record<string, unknown>,
	at: Location,
): SchemaNode {
	const { types, nullable, any } = typesOf(state, s, at);
	let node: SchemaNode;
	if (any) node = { kind: 'unknown' };
	else if (types.length === 0) {
		node = nullable ? { kind: 'null' } : inferred(state, s, at);
	} else if (types.length === 1) {
		node = typed(state, types[0] ?? 'null', s, at);
	} else {
		node = {
			kind: 'union',
			exclusive: false,
			variants: types.map((type) => typed(state, type, s, at)),
		};
	}
	// `unknown` already takes null, so it is never marked nullable.
	if (nullable && node.kind !== 'null' && node.kind !== 'unknown')
		node.nullable = true;
	return node;
}

/** The types `type` lists, `null` apart, and whether together they take anything. */
export function typesOf(
	state: Pick<SchemaState, 'diagnostics'>,
	s: Record<string, unknown>,
	at: Location,
): { types: string[]; nullable: boolean; any: boolean } {
	if (s['type'] === undefined)
		return { types: [], nullable: false, any: false };
	const types: string[] = [];
	let nullable = false;
	for (const type of Array.isArray(s['type']) ? s['type'] : [s['type']]) {
		if (typeof type !== 'string' || !JSON_TYPES.has(type)) {
			state.diagnostics.error(
				'invalid_schema',
				`\`type: ${JSON.stringify(type)}\` is not a JSON Schema type`,
				child(at, 'type'),
			);
		} else if (type === 'null') nullable = true;
		else if (!types.includes(type)) types.push(type);
	}
	// `number` already admits every integer.
	const merged = types.includes('number')
		? types.filter((type) => type !== 'integer')
		: types;
	// `unknown` takes null too, so every other type alone is a union.
	const any =
		nullable &&
		['string', 'number', 'boolean', 'array', 'object'].every((type) =>
			merged.includes(type),
		);
	return { types: merged, nullable, any };
}

/** A schema with no `type`: what its other keywords say it is. */
function inferred(
	state: TypedState,
	s: Record<string, unknown>,
	at: Location,
): SchemaNode {
	const has = (...keys: string[]) => keys.some((key) => key in s);
	if (has('properties', extraKeys(s), 'required')) {
		return objectNode(state, s, at);
	}
	if (has('items')) return arrayNode(state, s, at);
	if (
		has(
			'minimum',
			'maximum',
			'exclusiveMinimum',
			'exclusiveMaximum',
			'multipleOf',
		)
	) {
		return numberNode(state, false, s, at);
	}
	if (
		has(
			'minLength',
			'maxLength',
			'pattern',
			'format',
			'contentMediaType',
			'contentEncoding',
		)
	) {
		return stringNode(state, s, at);
	}
	// These bind only a list or an object, and saying which is `type`'s job.
	const [constraint] = [
		'minItems',
		'maxItems',
		'uniqueItems',
		'minProperties',
		'maxProperties',
	].filter((key) => key in s);
	if (constraint !== undefined) {
		state.diagnostics.warning(
			'not_enforced',
			`\`${constraint}\` without a \`type\` is not enforced: give the schema a \`type\``,
			child(at, constraint),
		);
	}
	return { kind: 'unknown' };
}

function typed(
	state: TypedState,
	type: string,
	s: Record<string, unknown>,
	at: Location,
): SchemaNode {
	switch (type) {
		case 'string':
			return stringNode(state, s, at);
		case 'integer':
			return numberNode(state, true, s, at);
		case 'number':
			return numberNode(state, false, s, at);
		case 'boolean':
			return { kind: 'boolean' };
		case 'array':
			return arrayNode(state, s, at);
		case 'object':
			return objectNode(state, s, at);
		default:
			return { kind: 'null' };
	}
}
