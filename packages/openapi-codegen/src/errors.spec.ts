import { describe, expect, it } from 'bun:test';
import { CodegenError } from './errors';

describe('CodegenError', () => {
	it('keeps its own keys in the order they were always in: name, then diagnostics', () => {
		expect(Object.keys(new CodegenError([]))).toEqual(['name', 'diagnostics']);
	});

	it('is named for what it is', () => {
		const error = new CodegenError([]);
		expect(error).toBeInstanceOf(Error);
		expect(error.name).toBe('CodegenError');
	});
});
