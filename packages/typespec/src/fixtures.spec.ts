/**
 * Every fixture under `test/fixtures/`: its `.tsp` compiles, with the
 * TypeSpec pinned in package.json, to the committed 3.1 and 3.2 specs, and
 * each generates with no warning. `bun run fixtures:typespec` accepts a
 * change. The code itself is type-checked by `typecheck:generated`.
 */
import { describe, expect, it } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { generateFiles } from '@nxgt/openapi-codegen';
import { CASES, emitted, spec, versionsOf } from '../test/generate';

describe.each([...CASES])('the %s fixture', (name) => {
	it('compiles to the committed specs', async () => {
		const now = await emitted(name);
		for (const version of versionsOf(name)) {
			expect(now[version]).toBe(await readFile(spec(name, version), 'utf8'));
		}
	}, 30_000);

	it.each([...versionsOf(name)])(
		'generates from OpenAPI %s with no warning',
		async (version) => {
			const { warnings } = await generateFiles({
				input: spec(name, version),
				output: '/unused',
				hono: true,
			});
			expect(warnings).toEqual([]);
		},
	);
});
