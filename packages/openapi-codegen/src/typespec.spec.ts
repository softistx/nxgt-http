/**
 * TypeSpec upstream of the generator: `test/fixtures/typespec/main.tsp`,
 * compiled to OpenAPI 3.1 by `@typespec/openapi3`, generates with no
 * diagnostic. The golden snapshots pin what it generates, and `tsc` checks it.
 */
import { describe, expect, it } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { emittedOpenAPI, TYPESPEC_PROJECT } from '../test/typespec';
import { generateFiles } from './generate';

const committed = `${TYPESPEC_PROJECT}openapi.yaml`;

describe('a spec authored in TypeSpec', () => {
	it('is what main.tsp compiles to: `bun run fixtures:typespec` accepts a change', async () => {
		expect(await emittedOpenAPI()).toBe(await readFile(committed, 'utf8'));
	}, 30_000);

	it('generates with no warning', async () => {
		const { warnings } = await generateFiles({
			input: committed,
			output: '/unused',
			hono: true,
		});
		expect(warnings).toEqual([]);
	});
});
