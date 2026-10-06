/**
 * The validator of a route: reads the parameters and the body with the
 * validators of `operations.ts`, hands the results to `c.req.valid()`, and
 * answers every issue at once when there is one.
 */
import type { MiddlewareHandler } from 'hono';
import type { RuntimeOperation } from '../engine';
import type { ValidationIssue } from '../errors';
import { readBody } from './body';
import { check } from './check';
import { fail } from './fail';
import { readHeaders, readQuery } from './parameters';
import type { Settings } from './types';

export function validation(
	id: string,
	operation: RuntimeOperation,
	settings: Settings,
): MiddlewareHandler {
	return async (c, next) => {
		const issues: ValidationIssue[] = [];
		check(c, issues, 'param', operation.param, c.req.param());
		check(c, issues, 'query', operation.query, readQuery(c, operation, issues));
		check(c, issues, 'header', operation.header, readHeaders(c, operation));
		if (operation.body) await readBody(c, operation.body, issues);
		if (issues.length > 0) {
			return fail(c, settings, {
				kind: 'request',
				operationId: id,
				method: operation.method,
				path: operation.path,
				issues,
			});
		}
		await next();
		return undefined;
	};
}
