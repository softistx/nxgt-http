import { describe, expect, test } from 'bun:test';
import { manifestShapeProblems } from './manifest';

describe('manifestShapeProblems', () => {
	const httpyz = { name: '@alxia/core', version: '0.4.0' };
	const binding = (peerDependencies: Record<string, string>) => ({
		name: '@alxia/client',
		version: '0.3.0',
		peerDependencies,
	});

	test('accepts a caret range on a sibling that includes it', () => {
		expect(
			manifestShapeProblems([httpyz, binding({ '@alxia/core': '^0.4.0' })]),
		).toEqual([]);
	});

	test('refuses an exact pin on a sibling: two copies, two ValidationError classes', () => {
		expect(
			manifestShapeProblems([httpyz, binding({ '@alxia/core': '0.4.0' })]),
		).toEqual([expect.stringContaining('pins a sibling exactly')]);
	});

	test('refuses a sibling range that excludes the sibling published beside it', () => {
		expect(
			manifestShapeProblems([httpyz, binding({ '@alxia/core': '^0.3.0' })]),
		).toEqual([
			expect.stringContaining(
				'excludes @alxia/core@0.4.0, which is being published beside it',
			),
		]);
	});

	test('refuses a package that lists itself', () => {
		expect(
			manifestShapeProblems([
				{ ...httpyz, dependencies: { '@alxia/core': '.' } },
			]),
		).toEqual([expect.stringContaining('lists itself')]);
	});

	test('refuses link: and file: where a consumer installs, and not in devDependencies', () => {
		expect(
			manifestShapeProblems([
				{
					name: '@alxia/core',
					dependencies: { a: 'link:../a' },
					optionalDependencies: { b: 'file:../b' },
					devDependencies: { c: 'link:../c' },
				},
			]),
		).toEqual([
			'@alxia/core: dependencies.a = link:../a',
			'@alxia/core: optionalDependencies.b = file:../b',
		]);
	});
});
