/**
 * The JavaScript side of the `@nxgt/typespec` library, which `lib/main.tsp`
 * imports from `dist/`: its name and diagnostics, and the decorators a
 * template cannot express. The conventions themselves are in `lib/`.
 */
import {
	createTypeSpecLibrary,
	type DecoratorContext,
	type Interface,
	type Program,
	paramMessage,
} from '@typespec/compiler';
import { getOperationId, setOperationId } from '@typespec/openapi';

export const $lib = createTypeSpecLibrary({
	name: '@nxgt/typespec',
	diagnostics: {
		'duplicate-operation-id': {
			severity: 'error',
			messages: {
				default: paramMessage`Two operations of @operationIds interfaces are named ${'id'}. Give one of them its own @operationId.`,
			},
		},
	},
	state: {
		operationIds: { description: 'The interfaces marked with @operationIds' },
	},
});

/**
 * `@operationIds`: marks the interface, whose ids are set once it is checked.
 * Not exported as `$operationIds`, which would declare it a second time, in
 * the global namespace.
 */
function operationIds(context: DecoratorContext, target: Interface): void {
	context.program.stateSet($lib.stateKeys.operationIds).add(target);
}

/**
 * Names each operation of a marked interface `<operation><Interface>`, such
 * as `listPets`, unless it has an `@operationId` of its own. It runs after
 * every decorator, so the order of `@operationId` and `@operationIds` in the
 * source does not matter. Two operations of those interfaces named alike, from
 * two interfaces of one name in two namespaces, or an `@operationId` copied by
 * `extends`, are an error: `@typespec/openapi3` would emit both without a
 * word.
 */
export function $onValidate(program: Program): void {
	const named = new Set<string>();
	for (const target of program.stateSet($lib.stateKeys.operationIds)) {
		const container = target as Interface;
		for (const operation of container.operations.values()) {
			const id =
				getOperationId(program, operation) ??
				`${operation.name}${container.name}`;
			if (named.has(id)) {
				$lib.reportDiagnostic(program, {
					code: 'duplicate-operation-id',
					format: { id },
					target: operation,
				});
			}
			named.add(id);
			setOperationId(program, operation, id);
		}
	}
}

export const $decorators = {
	Nxgt: { operationIds },
};
