/**
 * `@operationIds`: the id of each operation is its name, as written:
 * `@get findPostComments()` is `findPostComments`, where `@typespec/openapi3`
 * would write `Posts_findPostComments`. In an interface, a known verb takes
 * the interface's resource: `create` in `Users` is `createUser` (`verbs.ts`).
 */
import {
	type DecoratorContext,
	type Interface,
	isService,
	isTemplateInstance,
	listServices,
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
import { idOf, type OperationIdsOptions } from './resource';

/**
 * Marks the interface or the namespace; its ids are set once the program is
 * checked. On a template, TypeSpec runs it on each instance, which
 * `isMarkedInterface` follows to the interfaces extending it. A namespace
 * has no resource to name: `singular` and `plural` are an interface's.
 */
export function operationIds(
	context: DecoratorContext,
	target: Interface | Namespace,
	options: OperationIdsOptions = {},
): void {
	const { program } = context;
	program.stateSet($lib.stateKeys.operationIds).add(target);
	program.stateMap($lib.stateKeys.operationIdsOptions).set(target, options);
	if (
		target.kind === 'Namespace' &&
		(options.singular !== undefined || options.plural !== undefined)
	) {
		$lib.reportDiagnostic(program, {
			code: 'resource-name-on-namespace',
			target: context.decoratorTarget,
		});
	}
}

/** Marked itself, or in a marked namespace, however deep. */
export function isMarkedNamespace(
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
export function isNamed(program: Program, operation: Operation): boolean {
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
 * Whether the emitter writes the operation: not an instance of an operation
 * template, `Read<Pet>`, nor an operation of an interface template's
 * instance. An interface extending an instance copies its operations, which
 * are instances too, and emitted.
 */
function isEmitted(operation: Operation): boolean {
	const container = operation.interface;
	if (container === undefined) return !isTemplateInstance(operation);
	return !isTemplateInstance(container);
}

/**
 * The services whose document the operation is in: each `@service`
 * namespace around it, a nested one and the one outside it both. None, in a
 * program without a service, is the one document the emitter writes; in a
 * program with one, no document at all.
 */
function servicesOf(program: Program, operation: Operation): Namespace[] {
	const services: Namespace[] = [];
	for (
		let at = operation.interface?.namespace ?? operation.namespace;
		at !== undefined;
		at = at.namespace
	) {
		if (isService(program, at)) services.push(at);
	}
	return services;
}

/**
 * Sets the ids, after every decorator, so the order of `@operationId` and
 * `@operationIds` in the source does not matter. Two operations with one id
 * in one service's document, one of them named by `@operationIds`, are an
 * error: one name in two interfaces, an interface that `extends` another and
 * so copies its operations, or an `@operationId` written elsewhere.
 * `@typespec/openapi3` would emit both without a word. An operation
 * template's instance, such as `Read<Pet>`, is never emitted; only the
 * operations declared from it (`op readPet is Read<Pet>`) are.
 */
export function validateOperationIds(program: Program): void {
	const seen = new Map<Namespace | undefined, Map<string, boolean>>();
	const hasServices = listServices(program).length > 0;
	navigateProgram(program, {
		operation(operation) {
			if (!isEmitted(operation)) return;
			const named = isNamed(program, operation);
			const own = getOperationId(program, operation);
			// Elsewhere, only checked: the id `@typespec/openapi3` gives under its
			// default strategy.
			const id =
				own ??
				(named
					? idOf(program, operation)
					: resolveOperationId(program, operation));
			const services = servicesOf(program, operation);
			// Outside every service of a program that has one: in no document.
			const emitted = services.length > 0 || !hasServices;
			let duplicate = false;
			for (const service of services.length > 0 ? services : [undefined]) {
				const ids = seen.get(service) ?? new Map<string, boolean>();
				seen.set(service, ids);
				if (emitted && ids.has(id) && (named || ids.get(id))) duplicate = true;
				ids.set(id, named || (ids.get(id) ?? false));
			}
			if (duplicate) {
				$lib.reportDiagnostic(program, {
					code: 'duplicate-operation-id',
					format: { id },
					target: operation,
				});
			}
			// Only the ids it gives: an explicit id on any other operation would
			// override the emitter's `operation-id-strategy`.
			if (named && own === undefined) setOperationId(program, operation, id);
		},
	});
}
