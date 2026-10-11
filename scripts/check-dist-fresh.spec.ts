import { describe, expect, test } from 'bun:test';
import { staleSource } from './check-dist-fresh';

const at = (file: string, mtimeMs: number) => ({ file, mtimeMs });

describe('staleSource', () => {
	test('is undefined when dist is newer than every source', () => {
		expect(
			staleSource(at('dist/index.js', 10), [at('a', 5), at('b', 10)]),
		).toBeUndefined();
	});

	test('names the newest source newer than dist', () => {
		expect(
			staleSource(at('dist/index.js', 10), [
				at('a', 11),
				at('b', 20),
				at('c', 1),
			]),
		).toEqual(at('b', 20));
	});

	test('a missing dist is stale', () => {
		expect(staleSource(undefined, [at('a', 1)])).toBeDefined();
	});

	test('a missing dist with no sources is stale too', () => {
		expect(staleSource(undefined, [])).toBeDefined();
	});
});
