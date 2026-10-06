/** The helpers a validator of `operations.ts` may use, declared once at the top of the file. */
import { ISO_DATE } from '../zod';

export type Helper = 'flag' | 'isoDate' | 'none' | 'numeric' | 'repeated';

/** Declared at the top of `operations.ts` when a validator uses them. */
export const HELPERS: Record<Helper, string> = {
	isoDate: ISO_DATE,
	flag: [
		'/** `true` or `false`, as JSON spells them. */',
		"const flag = z.stringbool({ truthy: ['true'], falsy: ['false'] });",
	].join('\n'),
	none: [
		'/** A location with no parameters declared: whatever arrives there is dropped. */',
		'const none = z.object({});',
	].join('\n'),
	numeric: [
		"/** A number in a path, a query, a header or a cookie: digits, where z.coerce.number() would read '' as 0. */",
		'const numeric = z',
		'\t.string()',
		'\t.regex(/^-?(?:0|[1-9]\\d*)(?:\\.\\d+)?(?:[eE][+-]?\\d+)?$/)',
		'\t.transform(Number);',
	].join('\n'),
	repeated: [
		'/** A query key or a form field that may repeat: one value arrives alone, several as a list. */',
		'const repeated = (value: unknown) =>',
		'\tvalue === undefined || Array.isArray(value) ? value : [value];',
	].join('\n'),
};
