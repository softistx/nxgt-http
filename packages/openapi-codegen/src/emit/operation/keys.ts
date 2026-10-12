/** The keys an operation is found by in the generated indexes, and its parameter groups. */
import type { OperationIR, ParamIR } from '../../ir/types';

/** What `types.ts` declares beside the schemas, printed by `operationTypes`. */
export const OPERATION_INDEXES = [
	'Operations',
	'ClientOperations',
	'OperationsByRoute',
	'PathsByMethod',
	'OperationsByTag',
	'PathsByTag',
] as const;

/** An operation's route, its key in `OperationsByRoute`: `put /employees/{id}`. */
export const routeKey = (operation: OperationIR): string =>
	`${operation.method} ${operation.path}`;

/** Header names are case-insensitive: validated headers are keyed lowercased, as Hono reads them. */
export const paramKey = (param: ParamIR): string =>
	param.in === 'header' ? param.name.toLowerCase() : param.name;

/** An operation's parameters in one location, validated together. */
export interface ParamGroup {
	/** Where Hono's `c.req.valid()` finds them. */
	target: 'param' | 'query' | 'header';
	/** `GetPetQuery`, whose validator is `zGetPetQuery`. */
	name: string;
	params: ParamIR[];
}

const GROUPS = [
	['path', 'param', 'Param'],
	['query', 'query', 'Query'],
	['header', 'header', 'Header'],
] as const;

export function paramGroups(operation: OperationIR): ParamGroup[] {
	return GROUPS.flatMap(([location, target, suffix]) => {
		const params = operation.parameters.filter((p) => p.in === location);
		if (params.length === 0) return [];
		return [{ target, name: `${operation.name}${suffix}`, params }];
	});
}
