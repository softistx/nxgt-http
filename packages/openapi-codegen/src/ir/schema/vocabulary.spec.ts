import { describe, expect, it } from 'bun:test';
import { ANNOTATION_KEYS, UNSUPPORTED_KEYWORDS } from './vocabulary';

describe('vocabulary', () => {
	it('pins the keywords that annotate without changing what a schema accepts', () => {
		expect([...ANNOTATION_KEYS].sort()).toEqual([
			'$anchor',
			'$comment',
			'$id',
			'$schema',
			'default',
			'deprecated',
			'description',
			'example',
			'examples',
			'externalDocs',
			'nullable',
			'readOnly',
			'title',
			'writeOnly',
			'xml',
		]);
	});

	it('pins the keywords refused, which each have an error to report', () => {
		expect([...UNSUPPORTED_KEYWORDS].sort()).toEqual([
			'$dynamicAnchor',
			'$dynamicRef',
			'$recursiveRef',
			'contains',
			'dependentRequired',
			'dependentSchemas',
			'else',
			'if',
			'maxContains',
			'minContains',
			'not',
			'patternProperties',
			'prefixItems',
			'propertyNames',
			'then',
			'unevaluatedItems',
		]);
	});

	it('never lists one keyword as both an annotation and a refusal', () => {
		for (const keyword of UNSUPPORTED_KEYWORDS) {
			expect(ANNOTATION_KEYS.has(keyword)).toBe(false);
		}
		expect(new Set(UNSUPPORTED_KEYWORDS).size).toBe(
			UNSUPPORTED_KEYWORDS.length,
		);
	});
});
