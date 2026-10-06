import { child, type Location } from '../../loader/location';
import { asNumber, asString } from '../../util';
import type {
	NumberFormat,
	NumberNode,
	SchemaNode,
	StringFormat,
	StringNode,
} from '../types';
import type { SchemaState } from './state';

type ScalarState = Pick<SchemaState, 'diagnostics' | 'warnedFormats'>;

const STRING_FORMATS = new Set([
	'date-time',
	'date',
	'time',
	'duration',
	'email',
	'uri',
	'uuid',
	'ipv4',
	'ipv6',
]);

const NUMBER_FORMATS = new Set(['int32', 'int64', 'float', 'double']);

/** Whether `pattern` compiles, as Unicode or, failing that, in the legacy syntax. */
const isRegExp = (pattern: string): boolean =>
	['u', ''].some((flags) => {
		try {
			return new RegExp(pattern, flags) instanceof RegExp;
		} catch {
			return false;
		}
	});

/** `type: string`: a string, or `binary` for a file. */
export function stringNode(
	state: ScalarState,
	s: Record<string, unknown>,
	at: Location,
): SchemaNode {
	const format = asString(s['format']);
	const media = asString(s['contentMediaType']);
	if (
		format === 'binary' ||
		(media !== undefined &&
			s['contentEncoding'] === undefined &&
			!/^text\/|json$/.test(media))
	) {
		return { kind: 'binary' };
	}
	const node: StringNode = { kind: 'string' };
	if (format === 'byte' || s['contentEncoding'] === 'base64')
		node.format = 'byte';
	else if (format !== undefined) {
		if (STRING_FORMATS.has(format)) node.format = format as StringFormat;
		else if (!state.warnedFormats.has(format)) {
			state.warnedFormats.add(format);
			state.diagnostics.warning(
				'unknown_format',
				`format \`${format}\` is not validated; it is checked as a plain string`,
				child(at, 'format'),
			);
		}
	}
	const minLength = asNumber(s['minLength']);
	if (minLength !== undefined) node.minLength = minLength;
	const maxLength = asNumber(s['maxLength']);
	if (maxLength !== undefined) node.maxLength = maxLength;
	const pattern = asString(s['pattern']);
	if (pattern !== undefined) {
		if (isRegExp(pattern)) node.pattern = pattern;
		else {
			state.diagnostics.error(
				'invalid_schema',
				`\`pattern\` is not a valid regular expression: ${pattern}`,
				child(at, 'pattern'),
			);
		}
	}
	return node;
}

/** `type: number` or `type: integer`. */
export function numberNode(
	state: ScalarState,
	integer: boolean,
	s: Record<string, unknown>,
	at: Location,
): SchemaNode {
	const node: NumberNode = { kind: 'number', integer };
	const format = asString(s['format']);
	if (format !== undefined) {
		if (NUMBER_FORMATS.has(format)) node.format = format as NumberFormat;
		else if (!state.warnedFormats.has(format)) {
			state.warnedFormats.add(format);
			state.diagnostics.warning(
				'unknown_format',
				`format \`${format}\` is not validated; it is checked as a plain ${integer ? 'integer' : 'number'}`,
				child(at, 'format'),
			);
		}
	}
	for (const key of ['minimum', 'maximum', 'multipleOf'] as const) {
		const value = asNumber(s[key]);
		if (value !== undefined) node[key] = value;
	}
	for (const key of ['exclusiveMinimum', 'exclusiveMaximum'] as const) {
		const value = s[key];
		if (typeof value === 'number') node[key] = value;
		else if (typeof value === 'boolean') {
			state.diagnostics.error(
				'invalid_schema',
				`a boolean \`${key}\` is OpenAPI 3.0; in 3.1 it is the bound itself (\`${key}: <number>\`)`,
				child(at, key),
			);
		}
	}
	return node;
}
