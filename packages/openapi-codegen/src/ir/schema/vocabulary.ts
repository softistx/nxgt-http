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
