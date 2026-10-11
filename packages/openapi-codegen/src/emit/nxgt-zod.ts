/**
 * `scalars: 'exact'`: a string scalar of `@nxgt/typespec` printed as the
 * schema of `@nxgt/zod`, imported by name. The table of names is the IR's
 * (`ir/schema/nxgt-scalars.ts`).
 */
import { exactSchema } from '../ir/schema/nxgt-scalars';
import type { SchemaNode, StringNode } from '../ir/types';
import type { EmitOptions } from './context';
import { jsString, list, regexLiteral } from './printer';

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
 * The spec's own `pattern`, kept on top of the scalar's schema (the owner's
 * decision, 2026-10-11): a scalar narrowed by a pattern of its own
 * (`@pattern("^FR.*$") scalar FrIban extends Nxgt.iban`) is then never
 * validated more loosely than the spec says, and the canonical pattern is
 * checked besides, redundantly. The message is Zod's own for `.regex()`,
 * since the scalar's schema answers with its own (`Invalid IBAN`) otherwise.
 */
export function patternChecks(node: StringNode): string {
	if (node.pattern === undefined) return '';
	const regex = regexLiteral(node.pattern);
	const message = `Invalid string: must match pattern ${regex}`;
	return `.check(z.regex(${regex}, ${jsString(message)}))`;
}

/** Whether the node prints as a bare `@nxgt/zod` schema, with no call of `z`. */
export const printsWithoutZ = (
	options: Pick<EmitOptions, 'scalars'>,
	node: SchemaNode,
): boolean =>
	exactScalar(options, node) !== undefined &&
	node.kind === 'string' &&
	lengthChecks(node) + patternChecks(node) === '';

/** The import lines of a file's schemas: Zod when one calls `z`, then `@nxgt/zod`. */
export const zodImports = (imports: ReadonlySet<string>): string[] => [
	...(imports.has('z') ? ["import { z } from 'zod';"] : []),
	...nxgtImport(imports),
];

/** The line importing the `@nxgt/zod` exports among a file's imports (`z` is Zod's), or none. */
export function nxgtImport(imports: Iterable<string>): string[] {
	const names = [...new Set(imports)].filter((name) => name !== 'z').sort();
	return names.length === 0
		? []
		: [`import ${list('{ ', names, ' }', '')} from '@nxgt/zod';`];
}
