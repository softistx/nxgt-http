/** Keywords that describe a schema without changing what it accepts. */
export const ANNOTATION_KEYS = new Set([
	'title',
	'description',
	'deprecated',
	'readOnly',
	'writeOnly',
	'default',
	'example',
	'examples',
	'$comment',
	'externalDocs',
	'xml',
	'$schema',
	'$id',
	'$anchor',
	'nullable',
]);

/** JSON Schema that v1 cannot express faithfully: refused, never approximated. */
export const UNSUPPORTED_KEYWORDS = [
	'not',
	'if',
	'then',
	'else',
	'dependentSchemas',
	'dependentRequired',
	'patternProperties',
	'propertyNames',
	'unevaluatedItems',
	'prefixItems',
	'contains',
	'minContains',
	'maxContains',
	'$dynamicRef',
	'$dynamicAnchor',
	'$recursiveRef',
];

export const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

export const without = (
	object: Record<string, unknown>,
	drop: (key: string) => boolean,
): Record<string, unknown> =>
	Object.fromEntries(Object.entries(object).filter(([key]) => !drop(key)));

export const strings = (value: unknown): string[] =>
	Array.isArray(value)
		? value.filter((item): item is string => typeof item === 'string')
		: [];
