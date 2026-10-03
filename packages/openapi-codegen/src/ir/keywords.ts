import { isObject } from '../util';

/** Keywords that evaluate an object's keys in place, beside its own. */
const IN_PLACE = [
	'$ref',
	'allOf',
	'anyOf',
	'oneOf',
	'if',
	'then',
	'else',
	'dependentSchemas',
];

/**
 * The keyword a schema's extra keys are read from. With no
 * `additionalProperties` and no keyword that evaluates keys in place, a
 * schema-valued `unevaluatedProperties` sees exactly the keys
 * `additionalProperties` would: it is how TypeSpec's `Record<T>` reaches
 * OpenAPI 3.1.
 */
export const extraKeys = (
	s: Record<string, unknown>,
): 'additionalProperties' | 'unevaluatedProperties' =>
	!('additionalProperties' in s) &&
	isObject(s['unevaluatedProperties']) &&
	!IN_PLACE.some((key) => key in s)
		? 'unevaluatedProperties'
		: 'additionalProperties';

/**
 * Whether a schema-valued `unevaluatedProperties` needs no sealing: it is
 * read as `additionalProperties`, or moot beside it, which evaluates every
 * key already.
 */
export const settledByAdditional = (s: Record<string, unknown>): boolean =>
	isObject(s['unevaluatedProperties']) &&
	('additionalProperties' in s || extraKeys(s) === 'unevaluatedProperties');
