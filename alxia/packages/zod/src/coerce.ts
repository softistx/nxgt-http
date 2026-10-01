/**
 * Schemas for what arrives as text — path parameters, the query string,
 * headers, cookies — whose input is the value a client means to send. A
 * client sends `{ page: 2 }`, never `{ page: '2' }`, and the server reads a
 * number, where `z.coerce.number()` would type the client's side `unknown`.
 */
import { z } from 'zod';

const NUMERIC = /^\s*[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?\s*$/i;

/** A number, given as one or as its text. */
function number() {
	return z
		.union([z.number(), z.string().regex(NUMERIC, 'Expected a number')])
		.transform(Number)
		.pipe(z.number());
}

/** An integer, given as one or as its text. */
function int() {
	return number().pipe(z.number().int());
}

/** A boolean: `true`, `false`, or `'true'`, `'false'`, `'1'`, `'0'`. */
function boolean() {
	return z
		.union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
		.transform((value) => value === true || value === 'true' || value === '1');
}

/** A date: a `Date`, or ISO 8601 text, which is how a client sends one. */
function date() {
	return z
		.union([z.date(), z.iso.datetime({ offset: true }), z.iso.date()])
		.transform((value) => (value instanceof Date ? value : new Date(value)))
		.pipe(z.date());
}

/**
 * A list a query key gives: `?tag=a` reads `['a']`, `?tag=a&tag=b`
 * `['a', 'b']` — where `z.array` refuses the first.
 */
function array<Item extends z.ZodType>(item: Item) {
	return z
		.union([item, z.array(item)])
		.transform(
			(value) => (Array.isArray(value) ? value : [value]) as z.output<Item>[],
		);
}

/** A value given as JSON text: a filter in a query string. */
function json<Schema extends z.ZodType>(schema: Schema) {
	return z
		.union([
			z.string().transform((text, ctx) => {
				try {
					return JSON.parse(text) as unknown;
				} catch {
					ctx.addIssue({ code: 'custom', message: 'Expected JSON' });
					return z.NEVER;
				}
			}),
			z.custom<z.input<Schema>>((value) => typeof value !== 'string'),
		])
		.pipe(schema);
}

/** The coercions, as one namespace: `zq.int()`, `zq.array(z.string())`. */
export const zq = { number, int, boolean, date, array, json };
