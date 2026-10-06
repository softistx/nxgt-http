/** One target of a request through its validator. */
import type { Context } from 'hono';
import type { Validator } from '../engine';
import {
	toIssues,
	type ValidationIssue,
	type ValidationTarget,
} from '../errors';
import type { Validated } from './types';

/**
 * Runs `validator` on `value`: its issues join `issues`; its result, unless
 * the target is a raw `body`, goes to `c.req.valid()`.
 */
export function check(
	c: Context,
	issues: ValidationIssue[],
	target: ValidationTarget,
	validator: Validator,
	value: unknown,
): void {
	const result = validator.safeParse(value);
	if (!result.success) {
		issues.push(...toIssues(target, result.error.issues));
	} else if (target !== 'body') {
		c.req.addValidatedData(target, result.data as Validated);
	}
}
