/**
 * `@operationIds`: names each operation of an interface after its method and
 * the interface, `<operation><Interface>`, such as `listPets`.
 */
import {
	type DecoratorContext,
	getFriendlyName,
	type Interface,
	isTemplateInstance,
	type Model,
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

/**
 * Names the operation after one item, `<operation><Item>`, instead of its
 * interface, where `@operationIds` names it: `Resource` marks `read`,
 * `create`, `update` and `delete`, so `Authors` has `readAuthor`, but
 * `listAuthors`. Not public: `Resource`'s alone.
 */
export function itemOperation(
	context: DecoratorContext,
	target: Operation,
	item: Model,
): void {
	context.program.stateMap($lib.stateKeys.itemOperations).set(target, item);
}

/** The name `@operationIds` puts after the operation's: its item's, or its interface's. */
function nounOf(program: Program, operation: Operation): string | undefined {
	const item: Model | undefined = program
		.stateMap($lib.stateKeys.itemOperations)
		.get(operation);
	if (item === undefined) return operation.interface?.name;
	return getFriendlyName(program, item) ?? item.name;
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
 * elsewhere, or an operation in the service namespace, named after itself. `@typespec/openapi3` would emit both without a word.
 */
export function validateOperationIds(program: Program): void {
	const seen = new Map<string, boolean>();
	navigateProgram(program, {
		operation(operation) {
			const named = isNamed(program, operation);
			const own = getOperationId(program, operation);
			// Elsewhere, only checked: the id `@typespec/openapi3` gives under its
			// default strategy; an operation in the service namespace is named
			// after itself.
			const id =
				own ??
				(named
					? `${operation.name}${nounOf(program, operation)}`
					: resolveOperationId(program, operation));
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
