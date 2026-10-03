/**
 * The names `alxia.ts` declares. They share one module, apart from the types
 * of `types.ts`, so `EmitContext.#checkNames` claims them in a namespace of
 * their own.
 */
import { RESERVED } from '../../ir/schemas';
import type { OperationIR } from '../../ir/types';

/** What `alxia.ts` declares or imports besides the schemas and the operations. */
export const ALXIA_NAMES = [
	'z',
	'operations',
	'eventStream',
	'isoDate',
	'flag',
	'numeric',
	'repeated',
	'commas',
	'headerList',
] as const;

/** Globals the helpers above call: a `const` of that name would shadow them. */
const GLOBALS = new Set(['Number', 'Array', 'Date']);

/**
 * The `const` an operation is declared as in `alxia.ts`: its `operationId`
 * when that is an identifier, else the id in camelCase, `getPet` for
 * `get-pet`, suffixed when it is a reserved word or a global the file uses.
 */
export function operationConst(operation: OperationIR): string {
	const id = operation.operationId;
	const name = /^[A-Za-z_$][\w$]*$/.test(id)
		? id
		: operation.name.charAt(0).toLowerCase() + operation.name.slice(1);
	return RESERVED.has(name) || GLOBALS.has(name) ? `${name}Operation` : name;
}
