import { child, type Location } from '../../loader/location';
import { IDENTIFIER } from '../naming';
import type { Scalar, SchemaNode } from '../types';
import type { SchemaState } from './state';
import { typesOf } from './typed';

type LiteralState = Pick<SchemaState, 'diagnostics'>;

/** `const`, or `enum` with its `x-enum-varnames`, beside the `type` it may have. */
export function enumOrConst(
	state: LiteralState,
	s: Record<string, unknown>,
	at: Location,
): SchemaNode | undefined {
	if ('const' in s) {
		return typedLiteral(
			state,
			s,
			literal(state, [s['const']], child(at, 'const')),
			at,
		);
	}
	if (Array.isArray(s['enum'])) {
		const key = 'x-enum-varnames' in s ? 'x-enum-varnames' : 'x-enumNames';
		const names =
			key in s ? { key, value: s[key], at: child(at, key) } : undefined;
		return typedLiteral(
			state,
			s,
			literal(state, s['enum'], child(at, 'enum'), names),
			at,
		);
	}
	return undefined;
}

function literal(
	state: LiteralState,
	values: unknown[],
	at: Location,
	names?: { key: string; value: unknown; at: Location },
): SchemaNode {
	const kept: Scalar[] = [];
	let nullable = false;
	for (const value of values) {
		if (value === null) nullable = true;
		else if (
			typeof value === 'string' ||
			typeof value === 'number' ||
			typeof value === 'boolean'
		) {
			kept.push(value);
		} else {
			state.diagnostics.error(
				'invalid_schema',
				'an `enum` or `const` value must be a string, number, boolean or null',
				at,
			);
		}
	}
	if (kept.length === 0) {
		return nullable ? { kind: 'null' } : { kind: 'never' };
	}
	const named =
		names && enumNames(state, values, names.value, names.at, names.key);
	return {
		kind: 'literal',
		values: kept,
		...(nullable ? { nullable } : {}),
		...(named ? { names: named } : {}),
	};
}

/** `x-enum-varnames`: one distinct identifier per `enum` value, the one for `null` dropped. */
function enumNames(
	state: LiteralState,
	values: unknown[],
	names: unknown,
	at: Location,
	key: string,
): string[] | undefined {
	if (
		!Array.isArray(names) ||
		names.length !== values.length ||
		!names.every((name) => typeof name === 'string' && IDENTIFIER.test(name)) ||
		new Set(names).size !== names.length
	) {
		state.diagnostics.error(
			'invalid_schema',
			`${key} must list one distinct identifier per enum value`,
			at,
		);
		return undefined;
	}
	return names.filter((_, index) => values[index] !== null);
}

/** `type: string` beside `enum: [a, null]`: both apply, so `null` is out. */
function typedLiteral(
	state: LiteralState,
	s: Record<string, unknown>,
	node: SchemaNode,
	at: Location,
): SchemaNode {
	if (s['type'] === undefined || typesOf(state, s, at).nullable) return node;
	if (node.kind === 'null') return { kind: 'never' };
	delete node.nullable;
	return node;
}
