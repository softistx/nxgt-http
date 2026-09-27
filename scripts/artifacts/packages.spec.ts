import { describe, expect, test } from 'bun:test';
import { subpathsOf } from './packages';

describe('subpathsOf', () => {
	test('names every exported subpath, and not package.json', () => {
		expect(
			subpathsOf('@nxgt/httpyz', {
				'.': {},
				'./integration': {},
				'./package.json': './package.json',
			}),
		).toEqual(['@nxgt/httpyz', '@nxgt/httpyz/integration']);
	});
});
