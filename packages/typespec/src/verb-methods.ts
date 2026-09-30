/**
 * A verb names what an operation does, and its method says the same:
 * `create` in `Users` is `createUser`, and a `GET` would tell a cache, a
 * proxy or a retry it is safe. An operation `@operationIds` names after one
 * of the library's verbs is sent with that verb's methods (`verbs.ts`), or
 * warned of. A verb `verbs` adds has no method to check.
 */
import type { Operation, Program } from '@typespec/compiler';
import { getAllHttpServices } from '@typespec/http';
import { $lib } from './lib';
import { isNamed } from './operation-ids';
import { verbOf } from './resource';
import { METHODS } from './verbs';

/** `PUT or PATCH`. */
function methodsOf(methods: readonly string[]): string {
	return methods.map((method) => method.toUpperCase()).join(' or ');
}

/** Checks each operation of each service once, as the emitter sends it. */
export function validateVerbMethods(program: Program): void {
	const [services] = getAllHttpServices(program);
	const checked = new Set<Operation>();
	for (const service of services) {
		for (const { operation, verb: method } of service.operations) {
			if (checked.has(operation)) continue;
			checked.add(operation);
			if (!isNamed(program, operation)) continue;
			const verb = verbOf(program, operation);
			if (verb === undefined || !Object.hasOwn(METHODS, verb)) continue;
			const expected = METHODS[verb] as readonly string[];
			if (expected.includes(method)) continue;
			$lib.reportDiagnostic(program, {
				code: 'verb-method-mismatch',
				format: {
					operation: operation.name,
					method: method.toUpperCase(),
					verb,
					expected: methodsOf(expected),
				},
				target: operation,
			});
		}
	}
}
