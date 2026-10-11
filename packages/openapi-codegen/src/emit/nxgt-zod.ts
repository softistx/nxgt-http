/**
 * `scalars: 'exact'`: a string or numeric scalar of `@nxgt/typespec` printed as the
 * schema of `@nxgt/zod`, imported by name. The table of names is the IR's
 * (`ir/schema/nxgt-scalars.ts`).
 */
import {
	exactNumberScalar,
	exactSchema,
	type NumberBounds,
} from '../ir/schema/nxgt-scalars';
import type { NumberNode, SchemaNode, StringNode } from '../ir/types';
import type { EmitOptions } from './context';
import { jsString, list, regexLiteral } from './printer';

/** The `@nxgt/zod` export that validates the node, with `scalars: 'exact'` and a scalar that has one. */
export const exactScalar = (
	options: Pick<EmitOptions, 'scalars'>,
	node: SchemaNode,
): string | undefined => {
	if (options.scalars !== 'exact' || !('scalar' in node)) return undefined;
	if (node.scalar === undefined) return undefined;
	if (node.kind === 'string') return exactSchema(node.scalar);
	if (node.kind === 'number') {
		return exactNumberScalar(node.scalar, node.integer)?.schema;
	}
	return undefined;
};

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

/** A bound as a value and whether the value itself is out. */
interface Bound {
	value: number;
	exclusive: boolean;
}

type Side = 'lower' | 'upper';

/** The bound `bounds` sets on a side, if any: the exclusive keyword for an integer is the inclusive one next to it. */
function boundOf(
	bounds: NumberBounds,
	side: Side,
	integer: boolean,
): Bound | undefined {
	const [inclusive, exclusive] =
		side === 'lower'
			? [bounds.minimum, bounds.exclusiveMinimum]
			: [bounds.maximum, bounds.exclusiveMaximum];
	if (inclusive !== undefined) return { value: inclusive, exclusive: false };
	if (exclusive === undefined) return undefined;
	if (!integer) return { value: exclusive, exclusive: true };
	return { value: exclusive + (side === 'lower' ? 1 : -1), exclusive: false };
}

/** Whether every number `own` lets through is let through by `spec` too, on one side. */
function implies(own: Bound, spec: Bound, side: Side): boolean {
	const sign = side === 'lower' ? 1 : -1;
	const gap = (own.value - spec.value) * sign;
	return gap > 0 || (gap === 0 && (own.exclusive || !spec.exclusive));
}

const RULES: readonly {
	key: keyof NumberBounds;
	side: Side;
	call: string;
	message: string;
}[] = [
	{
		key: 'minimum',
		side: 'lower',
		call: 'gte',
		message: 'Too small: expected number to be >=',
	},
	{
		key: 'exclusiveMinimum',
		side: 'lower',
		call: 'gt',
		message: 'Too small: expected number to be >',
	},
	{
		key: 'maximum',
		side: 'upper',
		call: 'lte',
		message: 'Too big: expected number to be <=',
	},
	{
		key: 'exclusiveMaximum',
		side: 'upper',
		call: 'lt',
		message: 'Too big: expected number to be <',
	},
];

/**
 * The bounds of a number as checks, kept on top of the scalar's schema
 * (`.min()` and `.max()` are on `ZodNumber` only, and a scalar's schema is not
 * always one), each with the message Zod gives its own. A bound the scalar's
 * schema already enforces is left out: it would only report the same
 * violation twice. So a spec that adds nothing to the scalar prints it bare,
 * and one that narrows it (`@maxValue(1023) scalar WellKnownPort extends
 * port`) checks the narrower bound, which is never looser than the spec's.
 */
export function numberChecks(node: NumberNode): string {
	const own: NumberBounds =
		(node.scalar === undefined
			? undefined
			: exactNumberScalar(node.scalar, node.integer)?.bounds) ?? {};
	const checks: string[] = [];
	for (const rule of RULES) {
		const value = node[rule.key];
		if (value === undefined) continue;
		const mine = boundOf(own, rule.side, node.integer);
		const spec = boundOf({ [rule.key]: value }, rule.side, node.integer);
		if (
			mine !== undefined &&
			spec !== undefined &&
			implies(mine, spec, rule.side)
		) {
			continue;
		}
		const message = `${rule.message}${value}`;
		checks.push(`z.${rule.call}(${value}, ${jsString(message)})`);
	}
	if (node.multipleOf !== undefined) {
		const message = `Invalid number: must be a multiple of ${node.multipleOf}`;
		checks.push(`z.multipleOf(${node.multipleOf}, ${jsString(message)})`);
	}
	return checks.length === 0 ? '' : `.check(${checks.join(', ')})`;
}

/** Whether the node prints as a bare `@nxgt/zod` schema, with no call of `z`. */
export const printsWithoutZ = (
	options: Pick<EmitOptions, 'scalars'>,
	node: SchemaNode,
): boolean =>
	exactScalar(options, node) !== undefined &&
	(node.kind === 'string'
		? lengthChecks(node) + patternChecks(node) === ''
		: node.kind === 'number' && numberChecks(node) === '');

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
