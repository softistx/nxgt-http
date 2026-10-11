/**
 * `scalars: 'exact'`: a string scalar of `@nxgt/typespec` printed as the
 * schema of `@nxgt/zod`, imported by name. The table of names is the IR's
 * (`ir/schema/nxgt-scalars.ts`).
 */
import { exactSchema } from '../ir/schema/nxgt-scalars';
import type { SchemaNode, StringNode } from '../ir/types';
import type { EmitOptions } from './context';
import { jsString, list } from './printer';

/** The `@nxgt/zod` export that validates the node, with `scalars: 'exact'` and a scalar that has one. */
export const exactScalar = (
	options: Pick<EmitOptions, 'scalars'>,
	node: SchemaNode,
): string | undefined =>
	options.scalars === 'exact' &&
	node.kind === 'string' &&
	node.scalar !== undefined
		? exactSchema(node.scalar)
		: undefined;

/**
 * The length bounds of a string as checks, with the message Zod gives its own
 * (an `@nxgt/zod` schema has an error of its own, `Invalid IBAN`, which would
 * answer a length otherwise). A schema is not always a `ZodString`
 * (`ipSchema` is a union, `emojiSchema` a pipe), and only a `ZodString` has
 * `.min()` and `.max()`: `.check()` is on every schema.
 */
export function lengthChecks(node: StringNode): string {
	const checks: string[] = [];
	if (node.minLength !== undefined) {
		const message = `Too small: expected string to have >=${node.minLength} characters`;
		checks.push(`z.minLength(${node.minLength}, ${jsString(message)})`);
	}
	if (node.maxLength !== undefined) {
		const message = `Too big: expected string to have <=${node.maxLength} characters`;
		checks.push(`z.maxLength(${node.maxLength}, ${jsString(message)})`);
	}
	return checks.length === 0 ? '' : `.check(${checks.join(', ')})`;
}

/**
 * What the spec's own `pattern` adds to the scalar's schema, which is the
 * whole rule: nothing, for now. The owner's decision on a pattern that
 * differs from the scalar's plugs in here, as `.check(z.regex(…))` or a
 * diagnostic.
 */
export const patternChecks = (_node: StringNode): string => '';

/** The line importing the `@nxgt/zod` exports among a file's imports (`z` is Zod's), or none. */
export function nxgtImport(imports: Iterable<string>): string[] {
	const names = [...new Set(imports)].filter((name) => name !== 'z').sort();
	return names.length === 0
		? []
		: [`import ${list('{ ', names, ' }', '')} from '@nxgt/zod';`];
}
