/**
 * `@operationIds`: names each operation of an interface after its method and
 * the interface, `<operation><Interface>`, such as `listPets`.
 */
import {
	type DecoratorContext,
	type Interface,
	isTemplateInstance,
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
 * Marks the interface; its ids are set once the program is checked. On a
 * template, TypeSpec runs it on each instance, which `isMarked` follows to
 * the interfaces extending it.
 */
export function operationIds(
	context: DecoratorContext,
	target: Interface,
): void {
	context.program.stateSet($lib.stateKeys.operationIds).add(target);
}

/** Marked itself, or extending a marked interface: an instance of a marked template included. */
function isMarked(program: Program, target: Interface): boolean {
	return (
		program.stateSet($lib.stateKeys.operationIds).has(target) ||
		target.sourceInterfaces.some((source) => isMarked(program, source))
	);
}

/**
 * Whether `@operationIds` names the operation's id, or checks it: its
 * interface is marked, and is not a template instance, which is never
 * emitted; only the interfaces extending it are.
 */
function isNamed(program: Program, operation: Operation): boolean {
	const container = operation.interface;
	return (
		container !== undefined &&
		!isTemplateInstance(container) &&
		isMarked(program, container)
	);
}

/**
 * Sets the ids, after every decorator, so the order of `@operationId` and
 * `@operationIds` in the source does not matter. Two operations with one id,
 * one of them in a marked interface, are an error: two interfaces of one name
 * in two namespaces, an `@operationId` that `extends` copied, one written
 * elsewhere, or an operation outside an interface, named after itself. `@typespec/openapi3` would emit both without a word.
 */
export function validateOperationIds(program: Program): void {
	const seen = new Map<string, boolean>();
	navigateProgram(program, {
		operation(operation) {
			const named = isNamed(program, operation);
			const own = getOperationId(program, operation);
			// Elsewhere, the id `@typespec/openapi3` gives by default: an
			// operation outside an interface is named after itself.
			const id =
				own ??
				(named
					? `${operation.name}${operation.interface?.name}`
					: resolveOperationId(program, operation));
			if (seen.has(id) && (named || seen.get(id))) {
				$lib.reportDiagnostic(program, {
					code: 'duplicate-operation-id',
					format: { id },
					target: operation,
				});
			}
			seen.set(id, named || (seen.get(id) ?? false));
			if (own === undefined) setOperationId(program, operation, id);
		},
	});
}
