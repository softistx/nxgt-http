/**
 * The JavaScript side of the `@nxgt/typespec` library, which `lib/main.tsp`
 * imports from `dist/`: its name and diagnostics, and the decorators a
 * template cannot express. The conventions themselves are in `lib/`.
 *
 * A decorator is exported only through `$decorators`: a top-level `$name`
 * export would declare it a second time, in the global namespace.
 */
import type { Program } from '@typespec/compiler';
import { validateOneReplyPerStatus } from './one-reply-per-status';
import {
	itemOperation,
	operationIds,
	validateOperationIds,
} from './operation-ids';

export { $lib } from './lib';

export function $onValidate(program: Program): void {
	validateOperationIds(program);
	validateOneReplyPerStatus(program);
}

export const $decorators = {
	Nxgt: { operationIds },
	'Nxgt.Private': { itemOperation },
};
