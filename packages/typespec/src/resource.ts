/**
 * What `@operationIds` names an operation of an interface after: the
 * interface's resource, its singular and plural, and the verbs that take
 * them, layered from the library's, the namespaces', and the interface's.
 */
import type {
	Interface,
	Namespace,
	Operation,
	Program,
} from '@typespec/compiler';
import { $lib } from './lib';
import {
	type Grammar,
	idWithVerb,
	type Resource,
	singularOf,
	VERBS,
	verbIn,
} from './verbs';

/** `@operationIds`' options, as `OperationIdsOptions` declares them. */
export interface OperationIdsOptions {
	readonly singular?: string;
	readonly plural?: string;
	readonly verbs?: Readonly<Record<string, Grammar>>;
}

function optionsOf(
	program: Program,
	target: Interface | Namespace,
): OperationIdsOptions | undefined {
	return program.stateMap($lib.stateKeys.operationIdsOptions).get(target);
}

/** The interface, then those it extends, however deep. */
function lineageOf(target: Interface): Interface[] {
	return [target, ...target.sourceInterfaces.flatMap(lineageOf)];
}

/**
 * The verbs an interface's operations take: the library's, then each marked
 * namespace's around it, outermost first, then its lineage's, its own last,
 * each overriding the one before.
 */
function verbsOf(program: Program, target: Interface): Record<string, Grammar> {
	const namespaces: Namespace[] = [];
	for (let at = target.namespace; at !== undefined; at = at.namespace) {
		namespaces.unshift(at);
	}
	const layers = [...namespaces, ...lineageOf(target).reverse()];
	return Object.assign(
		{},
		VERBS,
		...layers.map((layer) => optionsOf(program, layer)?.verbs ?? {}),
	);
}

/**
 * An interface's resource: its own `plural`, or its name, and its own
 * `singular`, or the plural's singular. Never an interface it extends: two
 * interfaces extending one would share its names, and collide.
 */
function resourceOf(program: Program, target: Interface): Resource {
	const options = optionsOf(program, target);
	const plural = options?.plural || target.name;
	return { plural, singular: options?.singular || singularOf(plural) };
}

/** The id `@operationIds` gives: the name as written, or a verb with its resource. */
export function idOf(program: Program, operation: Operation): string {
	const container = operation.interface;
	if (container === undefined) return operation.name;
	return (
		idWithVerb(
			operation.name,
			() => resourceOf(program, container),
			verbsOf(program, container),
		) ?? operation.name
	);
}

/** The verb an operation of an interface is named with, `find` in `findById`. */
export function verbOf(
	program: Program,
	operation: Operation,
): string | undefined {
	const container = operation.interface;
	if (container === undefined) return undefined;
	return verbIn(operation.name, verbsOf(program, container))?.verb;
}
