import { child, type Location } from '../../loader/location';
import { asString, isObject } from '../../util';
import { operationIdFor, pascalCase, toHonoPath } from '../naming';
import type { HttpMethod, OperationIR, ParamIR } from '../types';
import { body } from './body';
import { parameters } from './parameters';
import { responses } from './responses';
import type { OperationState } from './state';
import { checkTemplate } from './template';

/** One operation: its id claimed, its parameters merged, its body and responses read. */
export function operation(
	state: OperationState,
	method: HttpMethod,
	path: string,
	raw: unknown,
	at: Location,
	shared: Map<string, ParamIR>,
): OperationIR | undefined {
	if (!isObject(raw)) {
		state.diagnostics.error(
			'invalid_operation',
			'an operation must be an object',
			at,
		);
		return undefined;
	}
	const operationId = claimOperationId(state, method, path, raw, at);
	if (operationId === undefined) return undefined;

	const name = pascalCase(operationId);
	// An operation's parameter replaces the path item's with the same name and location.
	const own = parameters(state, raw['parameters'], child(at, 'parameters'));
	const merged = [...new Map([...shared, ...own]).values()];
	const params = merged.filter((p) => p.in !== 'cookie');
	const cookies = merged.filter((p) => p.in === 'cookie');
	checkTemplate(state, path, params, at);
	const queryMethod = isQueryMethod(state, method, raw, at);
	if (raw['callbacks'] !== undefined) {
		state.diagnostics.warning(
			'ignored',
			'callbacks are not generated',
			child(at, 'callbacks'),
		);
	}

	return {
		operationId,
		name,
		method,
		path,
		honoPath: toHonoPath(path),
		summary: asString(raw['summary']),
		description: asString(raw['description']),
		deprecated: raw['deprecated'] === true,
		queryMethod,
		tags: Array.isArray(raw['tags'])
			? raw['tags'].filter((tag): tag is string => typeof tag === 'string')
			: [],
		parameters: params,
		cookies,
		body:
			raw['requestBody'] === undefined
				? undefined
				: body(state, raw['requestBody'], child(at, 'requestBody'), name),
		responses: responses(state, raw['responses'], child(at, 'responses'), name),
		location: at,
	};
}

/**
 * `x-nxgt-method: query`, as `@nxgt/typespec`'s `@queryMethod` writes it: a
 * `POST` that is a `QUERY`. On another method, or with another value, it says
 * nothing the generator can use, and is ignored with a warning.
 */
function isQueryMethod(
	state: OperationState,
	method: HttpMethod,
	raw: Record<string, unknown>,
	at: Location,
): boolean {
	const marked = raw['x-nxgt-method'];
	if (marked === undefined) return false;
	if (marked === 'query' && method === 'post') return true;
	state.diagnostics.warning(
		'ignored',
		marked === 'query'
			? `x-nxgt-method: query marks a POST as a QUERY, not a ${method.toUpperCase()}`
			: `x-nxgt-method is query, or absent: ${JSON.stringify(marked)} is not one`,
		child(at, 'x-nxgt-method'),
	);
	return false;
}

/**
 * The operation's `operationId`, or one derived from its method and path
 * with a warning; `undefined`, with an error, when another operation has it.
 */
function claimOperationId(
	state: Pick<OperationState, 'diagnostics' | 'ids' | 'schemas'>,
	method: HttpMethod,
	path: string,
	raw: Record<string, unknown>,
	at: Location,
): string | undefined {
	let operationId = asString(raw['operationId']);
	if (!operationId) {
		operationId = operationIdFor(method, path);
		state.diagnostics.warning(
			'missing_operation_id',
			`no \`operationId\`; generated as \`${operationId}\``,
			at,
		);
	}
	const previous = state.ids.get(operationId);
	if (previous) {
		state.diagnostics.error(
			'duplicate_operation_id',
			`\`operationId: ${operationId}\` is also used at ${state.schemas.display(previous)}`,
			child(at, 'operationId'),
		);
		return undefined;
	}
	state.ids.set(operationId, at);
	return operationId;
}
