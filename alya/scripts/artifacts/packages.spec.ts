import { describe, expect, test } from 'bun:test';
import { subpathsOf } from './packages';

describe('subpathsOf', () => {
	test('names every exported subpath, and not package.json', () => {
		expect(
			subpathsOf('@alya/server', {
				'.': {},
				'./integration': {},
				'./package.json': './package.json',
			}),
		).toEqual(['@alya/server', '@alya/server/integration']);
	});
});
