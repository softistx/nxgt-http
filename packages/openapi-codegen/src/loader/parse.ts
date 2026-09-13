import { extname } from 'node:path';

export class ParseFailure extends Error {
	constructor(
		readonly code: 'parse_error' | 'invalid_root',
		message: string,
	) {
		super(message);
	}
}

/**
 * One file of a spec, as an object. `.json` goes through `JSON.parse`,
 * everything else through `Bun.YAML` — YAML 1.2, so `200:` is the key `"200"`
 * and `2024-01-01` stays a string.
 */
export function parseDocument(
	text: string,
	file: string,
): Record<string, unknown> {
	let value: unknown;
	try {
		value =
			extname(file).toLowerCase() === '.json'
				? JSON.parse(text)
				: Bun.YAML.parse(text);
	} catch (error) {
		throw new ParseFailure(
			'parse_error',
			`cannot parse: ${(error as Error).message}`,
		);
	}
	// Bun.YAML answers a multi-document file (`---` between documents) with an
	// array, which is also what a top-level YAML list looks like. Neither is an
	// OpenAPI file.
	if (Array.isArray(value)) {
		throw new ParseFailure(
			'invalid_root',
			'holds several YAML documents or a top-level list; a spec file must hold exactly one object',
		);
	}
	if (value === null || typeof value !== 'object') {
		throw new ParseFailure('invalid_root', 'does not hold an object');
	}
	return value as Record<string, unknown>;
}
