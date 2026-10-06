/** The declared parameters of a request, read off Hono's request. */
import type { Context } from 'hono';
import type { RuntimeOperation } from '../engine';
import type { ValidationIssue } from '../errors';

/**
 * Declared query parameters: a string each, or every value of a list. A key
 * that takes one value and is sent twice is an issue: the handler would see
 * the first value and `c.req.queries()` the other.
 */
export function readQuery(
	c: Context,
	operation: RuntimeOperation,
	issues: ValidationIssue[],
): Record<string, unknown> {
	const query: Record<string, unknown> = {};
	for (const param of operation.parameters) {
		if (param.in !== 'query') continue;
		if (param.list && param.explode) {
			const values = c.req.queries(param.name);
			if (values !== undefined) query[param.name] = values;
			continue;
		}
		const sent = c.req.queries(param.name)?.length ?? 0;
		if (sent > 1) {
			issues.push({
				target: 'query',
				path: [param.name],
				code: 'repeated_parameter',
				message: `${param.name} is sent ${sent} times, and takes one value`,
			});
		}
		const value = c.req.query(param.name);
		if (value !== undefined) {
			query[param.name] = param.list ? value.split(',') : value;
		}
	}
	return query;
}

/** Declared headers, keyed lowercased; a list split on commas. */
export function readHeaders(
	c: Context,
	operation: RuntimeOperation,
): Record<string, unknown> {
	const headers: Record<string, unknown> = {};
	for (const param of operation.parameters) {
		if (param.in !== 'header') continue;
		const value = c.req.header(param.name);
		if (value === undefined) continue;
		headers[param.name.toLowerCase()] = param.list
			? value.split(',').map((item) => item.trim())
			: value;
	}
	return headers;
}
