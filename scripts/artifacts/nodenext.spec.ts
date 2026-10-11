import { describe, expect, test } from 'bun:test';
import { declarationsResolve, fixtureSource, ownErrors } from './nodenext';

const REL =
	'/tmp/w/node_modules/@nxgt/httpyz/dist/index.d.ts(1,30): error TS2834: Relative import paths need explicit file extensions.';

describe('fixtureSource', () => {
	test('imports every subpath and keeps the unknown-option case for httpyz', () => {
		const text = fixtureSource({
			name: '@nxgt/httpyz',
			subpaths: ['@nxgt/httpyz', '@nxgt/httpyz/integration'],
		});
		expect(text).toContain("from '@nxgt/httpyz/integration'");
		expect(text).toContain('@ts-expect-error');
	});

	test('a package without a case only imports its subpaths', () => {
		const text = fixtureSource({ name: '@nxgt/x', subpaths: ['@nxgt/x'] });
		expect(text).not.toContain('@ts-expect-error');
	});
});

describe('ownErrors', () => {
	test('keeps our packages and the fixture, drops a dependency', () => {
		const unused =
			"@nxgt__httpyz.ts(3,1): error TS2578: Unused '@ts-expect-error' directive.";
		const dependency =
			'/tmp/w/node_modules/hono/dist/x.d.ts(1,1): error TS2304: Cannot find name.';
		const output = [REL, dependency, unused, 'Found 3 errors.'].join('\n');
		expect(ownErrors(output)).toEqual([REL, unused]);
	});
});

describe('declarationsResolve', () => {
	test('fails on an error in a package and passes on none', async () => {
		const pkgs = [{ name: '@nxgt/httpyz', subpaths: ['@nxgt/httpyz'] }];
		const dir = await Bun.$`mktemp -d`.text();
		const run = (output: string) =>
			declarationsResolve(dir.trim(), pkgs, async () => ({
				exitCode: output ? 2 : 0,
				output,
			}));
		expect(await run('')).toBe(true);
		expect(await run(REL)).toBe(false);
	});
});
