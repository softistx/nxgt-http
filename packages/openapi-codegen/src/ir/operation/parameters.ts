import { child, type Location } from '../../loader/location';
import { asString, isObject } from '../../util';
import type { ParamIR, ParamLocation } from '../types';
import type { OperationState } from './state';

/** The one serialization each location supports in v1. */
const STYLE: Record<ParamLocation, string> = {
	path: 'simple',
	query: 'form',
	header: 'simple',
	cookie: 'form',
};

/** OpenAPI says header parameters with these names are ignored: HTTP owns them. */
const RESERVED_HEADERS = new Set(['accept', 'content-type', 'authorization']);

/** A `parameters` list, keyed by `in:name`, the name lowercased for a header. */
export function parameters(
	state: Pick<OperationState, 'diagnostics' | 'resolver' | 'schemas'>,
	raw: unknown,
	at: Location,
): Map<string, ParamIR> {
	const found = new Map<string, ParamIR>();
	if (raw === undefined) return found;
	if (!Array.isArray(raw)) {
		state.diagnostics.error(
			'invalid_operation',
			'`parameters` must be a list',
			at,
		);
		return found;
	}
	for (const [index, value] of raw.entries()) {
		const parameter = parameterOf(state, value, child(at, index));
		if (!parameter) continue;
		// Header names are case-insensitive; the rest are not.
		const key =
			parameter.in === 'header' ? parameter.name.toLowerCase() : parameter.name;
		found.set(`${parameter.in}:${key}`, parameter);
	}
	return found;
}

function parameterOf(
	state: Pick<OperationState, 'diagnostics' | 'resolver' | 'schemas'>,
	raw: unknown,
	site: Location,
): ParamIR | undefined {
	const { value: p, location: at } = state.resolver.deref(raw, site);
	if (
		!isObject(p) ||
		typeof p['name'] !== 'string' ||
		typeof p['in'] !== 'string'
	) {
		state.diagnostics.error(
			'invalid_operation',
			'a parameter needs a string `name` and `in`',
			at,
		);
		return undefined;
	}
	const where = locationOf(state, p['in'], at);
	if (where === undefined) return undefined;
	if (where === 'header' && RESERVED_HEADERS.has(p['name'].toLowerCase())) {
		return undefined;
	}
	if ('content' in p) {
		state.diagnostics.error(
			'unsupported_parameter',
			`parameter \`${p['name']}\` is described by \`content\`; describe it with \`schema\``,
			child(at, 'content'),
		);
		return undefined;
	}
	const style = asString(p['style']) ?? STYLE[where];
	if (style !== STYLE[where]) {
		state.diagnostics.error(
			'unsupported_parameter',
			`\`style: ${style}\` is not supported for a ${where} parameter, only \`${STYLE[where]}\``,
			child(at, 'style'),
		);
		return undefined;
	}
	if (where === 'path' && p['required'] !== true) {
		state.diagnostics.warning(
			'invalid_operation',
			'a path parameter is always required; `required: true` is implied',
			at,
		);
	}
	return {
		name: p['name'],
		in: where,
		required: where === 'path' || p['required'] === true,
		explode:
			typeof p['explode'] === 'boolean' ? p['explode'] : style === 'form',
		schema: state.schemas.node(p['schema'], child(at, 'schema')),
		description: asString(p['description']),
		deprecated: p['deprecated'] === true ? true : undefined,
		location: at,
	};
}

/** A parameter's `in`, when it is one of the four locations this reads. */
function locationOf(
	state: Pick<OperationState, 'diagnostics'>,
	where: string,
	at: Location,
): ParamLocation | undefined {
	if (where === 'querystring') {
		state.diagnostics.error(
			'unsupported_parameter',
			'`in: querystring` (OpenAPI 3.2) is not supported',
			child(at, 'in'),
		);
		return undefined;
	}
	if (
		where !== 'path' &&
		where !== 'query' &&
		where !== 'header' &&
		where !== 'cookie'
	) {
		state.diagnostics.error(
			'invalid_operation',
			`\`in: ${where}\` is not a parameter location`,
			child(at, 'in'),
		);
		return undefined;
	}
	return where;
}
