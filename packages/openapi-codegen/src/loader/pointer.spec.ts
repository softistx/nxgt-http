import { describe, expect, it } from 'bun:test';
import { formatPointer, lookup, parsePointer } from './pointer';

describe('JSON pointer', () => {
	it('escapes `~` and `/` and reads them back', () => {
		const tokens = ['paths', '/employees/{id}', 'a~b', '~1'];
		const pointer = formatPointer(tokens);
		expect(pointer).toBe('/paths/~1employees~1{id}/a~0b/~01');
		expect(parsePointer(pointer)).toEqual(tokens);
	});

	it('treats the empty pointer as the root and rejects a relative one', () => {
		expect(parsePointer('')).toEqual([]);
		expect(parsePointer('paths')).toBeUndefined();
	});

	it('walks objects and arrays, and reports what is not there', () => {
		const document = { a: [{ b: 1 }], '200': 'ok' };
		expect(lookup(document, '/a/0/b')).toEqual({ found: true, value: 1 });
		expect(lookup(document, '/200')).toEqual({ found: true, value: 'ok' });
		expect(lookup(document, '/a/1')).toEqual({ found: false });
		expect(lookup(document, '/a/01')).toEqual({ found: false });
		expect(lookup(document, '/missing')).toEqual({ found: false });
		expect(lookup(document, '/toString')).toEqual({ found: false });
	});
});
