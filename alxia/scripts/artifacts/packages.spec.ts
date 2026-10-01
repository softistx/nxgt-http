import { describe, expect, test } from 'bun:test';
import { subpathsOf } from './packages';

describe('subpathsOf', () => {
	test('names every exported subpath, and not package.json', () => {
		expect(
			subpathsOf('@alxia/core', {
				'.': {},
				'./integration': {},
				'./package.json': './package.json',
			}),
		).toEqual(['@alxia/core', '@alxia/core/integration']);
	});
});
