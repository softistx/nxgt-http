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
import { operationIds, validateOperationIds } from './operation-ids';
import { validateVerbMethods } from './verb-methods';

export { $lib } from './lib';
export { $linter } from './linter';

export function $onValidate(program: Program): void {
	// Before the ids are set: only an `@operationId` written in the spec is
	// one then, and the operation it names is not checked.
	validateVerbMethods(program);
	validateOperationIds(program);
	validateOneReplyPerStatus(program);
}

export const $decorators = {
	Nxgt: { operationIds },
};
