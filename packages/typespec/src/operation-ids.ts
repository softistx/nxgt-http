/**
 * `@operationIds`: the id of each operation is its name, as written:
 * `@get findPostComments()` is `findPostComments`, where `@typespec/openapi3`
 * would write `Posts_findPostComments`.
 */
import {
	type DecoratorContext,
	type Interface,
	isTemplateInstance,
	type Namespace,
	navigateProgram,
	type Operation,
	type Program,
} from '@typespec/compiler';
import {
	getOperationId,
	resolveOperationId,
	setOperationId,
} from '@typespec/openapi';
import { $lib } from './lib';

/**
 * Marks the interface or the namespace; its ids are set once the program is
 * checked. On a template, TypeSpec runs it on each instance, which
 * `isMarkedInterface` follows to the interfaces extending it.
 */
export function operationIds(
	context: DecoratorContext,
	target: Interface | Namespace,
): void {
	context.program.stateSet($lib.stateKeys.operationIds).add(target);
}

/** Marked itself, or in a marked namespace, however deep. */
function isMarkedNamespace(
	program: Program,
	target: Namespace | undefined,
): boolean {
	for (let at = target; at !== undefined; at = at.namespace) {
		if (program.stateSet($lib.stateKeys.operationIds).has(at)) return true;
	}
	return false;
}

/** Marked itself, or extending a marked interface: an instance of a marked template included. */
function isMarkedInterface(program: Program, target: Interface): boolean {
	return (
		program.stateSet($lib.stateKeys.operationIds).has(target) ||
		target.sourceInterfaces.some((source) => isMarkedInterface(program, source))
	);
}

/**
 * Whether `@operationIds` names the operation's id, or checks it: its
 * interface or one of its namespaces is marked. An interface template's
 * instance is never emitted; only the interfaces extending it are.
 */
function isNamed(program: Program, operation: Operation): boolean {
	const container = operation.interface;
	if (container === undefined) {
		return isMarkedNamespace(program, operation.namespace);
	}
	return (
		!isTemplateInstance(container) &&
		(isMarkedInterface(program, container) ||
			isMarkedNamespace(program, container.namespace))
	);
}

/**
 * Sets the ids, after every decorator, so the order of `@operationId` and
 * `@operationIds` in the source does not matter. Two operations with one id,
 * one of them named by `@operationIds`, are an error: one name in two
 * interfaces, an interface that `extends` another and so copies its
 * operations, or an `@operationId` written elsewhere. `@typespec/openapi3`
 * would emit both without a word.
 */
export function validateOperationIds(program: Program): void {
	const seen = new Map<string, boolean>();
	navigateProgram(program, {
		operation(operation) {
			const named = isNamed(program, operation);
			const own = getOperationId(program, operation);
			// Elsewhere, only checked: the id `@typespec/openapi3` gives under its
			// default strategy.
			const id =
				own ??
				(named ? operation.name : resolveOperationId(program, operation));
			if (seen.has(id) && (named || seen.get(id))) {
				$lib.reportDiagnostic(program, {
					code: 'duplicate-operation-id',
					format: { id },
					target: operation,
				});
			}
			seen.set(id, named || (seen.get(id) ?? false));
			// Only the ids it gives: an explicit id on any other operation would
			// override the emitter's `operation-id-strategy`.
			if (named && own === undefined) setOperationId(program, operation, id);
		},
	});
}
