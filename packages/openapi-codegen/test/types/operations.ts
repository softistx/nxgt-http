/**
 * The indexes of `types.ts`, as a server reads them: from a route or a
 * tag to its operations, and from an operation to what its handler gets and
 * may reply. What a caller sends is `paths.ts`, checked in `paths.ts`.
 */
import type {
	Operations,
	OperationsByRoute,
	OperationsByTag,
	PathsByMethod,
	PathsByTag,
	UpdateEmployeeParam,
} from '../generated/split/types.js';

type Equal<X, Y> = [X] extends [Y] ? ([Y] extends [X] ? true : false) : false;
type Assert<T extends true> = T;

export type Checks = [
	Assert<Equal<OperationsByRoute['put /employees/{id}'], 'updateEmployee'>>,
	Assert<Equal<Operations['updateEmployee']['param'], UpdateEmployeeParam>>,
	Assert<Equal<Operations['updateEmployee']['honoPath'], '/employees/:id'>>,
	// As validated: a number, not the string of the query.
	Assert<
		Equal<Operations['listEmployees']['query']['page'], number | undefined>
	>,
	Assert<
		Equal<keyof Operations['deleteEmployee']['responses'], 204 | 400 | 404>
	>,
	Assert<
		Equal<
			OperationsByTag['employees'],
			| 'listEmployees'
			| 'createEmployee'
			| 'getEmployee'
			| 'updateEmployee'
			| 'deleteEmployee'
		>
	>,
	Assert<Equal<PathsByTag['employees']['delete'], '/employees/{id}'>>,
	Assert<Equal<PathsByMethod['patch'], never>>,
];

// @ts-expect-error no operation patches /employees
export type NoPatch = OperationsByRoute['patch /employees'];
// @ts-expect-error the map holds what a handler gets, with no input-side copy
export type NoInput = Operations['createEmployee']['jsonInput'];
