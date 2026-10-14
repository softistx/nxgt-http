/**
 * Which nodes of a document the crawl descends into, and where it looks for a
 * `$ref`. Pure: it yields steps in document order and the crawler acts on
 * them, so the keyword tables live apart from the file reading.
 */
import { child, type Location } from './location';

/**
 * Keys whose value is literal data. A `{ $ref }` inside an `example` is an
 * example payload, not a reference, and following it would report a missing
 * file that was never meant to exist.
 */
const LITERAL_KEYS = new Set([
	'example',
	'default',
	'const',
	'enum',
	'value',
	'dataValue',
	'serializedValue',
]);

/**
 * Keys whose value maps user-chosen names to objects. One level inside, a key
 * is a name: a property called `default` or `example` is a schema there, not
 * a keyword to skip.
 */
const NAME_MAP_KEYS = new Set([
	'paths',
	'webhooks',
	'schemas',
	'responses',
	'parameters',
	'examples',
	'requestBodies',
	'headers',
	'securitySchemes',
	'links',
	'callbacks',
	'pathItems',
	'mediaTypes',
	'properties',
	'patternProperties',
	'$defs',
	'definitions',
	'dependentSchemas',
	'content',
	'encoding',
	'variables',
]);

export type Step =
	/** A `$ref` value written at `at`, to be followed. */
	| { ref: unknown; at: Location }
	/** A child to descend into; `names` when its keys are user-chosen names. */
	| { node: unknown; at: Location; names: boolean };

/** What to do at `node`: follow its `$ref`, then descend into its children. */
export function* steps(
	node: unknown,
	at: Location,
	names: boolean,
): Generator<Step> {
	if (Array.isArray(node)) {
		for (const [index, item] of node.entries()) {
			yield { node: item, at: child(at, index), names: false };
		}
		return;
	}
	if (node === null || typeof node !== 'object') return;
	const object = node as Record<string, unknown>;
	if (!names && '$ref' in object) yield { ref: object['$ref'], at };
	for (const [key, value] of Object.entries(object)) {
		if (names) {
			yield { node: value, at: child(at, key), names: false };
			continue;
		}
		if (key === '$ref' || key.startsWith('x-') || LITERAL_KEYS.has(key)) {
			continue;
		}
		// JSON Schema `examples` is a list of literal values; OpenAPI's is a
		// map of Example Objects, which may themselves be `$ref`s.
		if (key === 'examples' && Array.isArray(value)) continue;
		yield { node: value, at: child(at, key), names: NAME_MAP_KEYS.has(key) };
	}
}
