/**
 * `@queryMethod`: a `POST` that is a `QUERY`, a safe request with its
 * criteria in the body. `@typespec/http` declares no `QUERY` yet, so the
 * operation is sent as a `POST` and the document marks it,
 * `x-nxgt-method: query`, for `@nxgt/openapi-codegen`.
 */
import type { DecoratorContext, Operation, Program } from '@typespec/compiler';
import { getAllHttpServices } from '@typespec/http';
import { setExtension } from '@typespec/openapi';
import { $lib } from './lib';

export function queryMethod(
	context: DecoratorContext,
	target: Operation,
): void {
	const { program } = context;
	program.stateSet($lib.stateKeys.queryMethod).add(target);
	setExtension(program, target, 'x-nxgt-method', 'query');
}

/** Marked with `@queryMethod`. */
export function isQueryMethod(program: Program, operation: Operation): boolean {
	return program.stateSet($lib.stateKeys.queryMethod).has(operation);
}

/** Each marked operation is a `POST`, as the emitter sends it. */
export function validateQueryMethods(program: Program): void {
	const [services] = getAllHttpServices(program);
	const checked = new Set<Operation>();
	for (const service of services) {
		for (const { operation, verb: method } of service.operations) {
			if (checked.has(operation)) continue;
			checked.add(operation);
			if (!isQueryMethod(program, operation) || method === 'post') continue;
			$lib.reportDiagnostic(program, {
				code: 'query-method-not-post',
				format: { operation: operation.name, method: method.toUpperCase() },
				target: operation,
			});
		}
	}
}
