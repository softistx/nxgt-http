import { describe, expect, it } from 'bun:test';
import {
	docComment,
	group,
	jsString,
	jsValue,
	list,
	propertyKey,
	regexLiteral,
} from './printer';

describe('printer', () => {
	it('quotes strings with single quotes, escaping what must be', () => {
		expect(jsString(`it's a\\b\nc`)).toBe(`'it\\'s a\\\\b\\nc'`);
	});

	it('quotes keys that are not identifiers, and computes __proto__', () => {
		expect(['name', 'x-trace-id', '1st', '__proto__'].map(propertyKey)).toEqual(
			['name', `'x-trace-id'`, `'1st'`, `['__proto__']`],
		);
	});

	it('prints JSON values as literals', () => {
		expect(jsValue({ a: [1, 'b', null], 'c-d': true })).toBe(
			`{ a: [1, 'b', null], 'c-d': true }`,
		);
		expect(jsValue({})).toBe('{}');
	});

	it('prints a pattern as a literal that matches the same', () => {
		const cases = ['^a/b$', '^[a/b]+$', '^a\\/b$', '', '\\d+'];
		expect(cases.map(regexLiteral)).toEqual([
			'/^a\\/b$/',
			'/^[a/b]+$/',
			'/^a\\/b$/',
			'/(?:)/',
			'/\\d+/',
		]);
		for (const pattern of cases) {
			const literal = regexLiteral(pattern);
			// Parses the literal as JavaScript would, to compare it with the regex.
			const parsed = new Function(`return ${literal}`)() as RegExp;
			expect(parsed.source).toBe(new RegExp(pattern).source);
		}
	});

	it('writes one-line and multi-line JSDoc, defusing */', () => {
		expect(docComment(['Short.'], '\t')).toEqual(['\t/** Short. */']);
		expect(docComment(['First.\nSecond */ here.', '@deprecated'], '')).toEqual([
			'/**',
			' * First.',
			' * Second *\\/ here.',
			' * @deprecated',
			' */',
		]);
		expect(docComment([], '')).toEqual([]);
	});

	it('breaks a list one item per line only when it is long', () => {
		expect(list('[', ['a', 'b'], ']', '')).toBe('[a, b]');
		expect(list('[', ['a'.repeat(40), 'b'.repeat(40)], ']', '\t')).toBe(
			`[\n\t\t${'a'.repeat(40)},\n\t\t${'b'.repeat(40)},\n\t]`,
		);
	});

	it('groups a union where precedence needs it', () => {
		expect(group('A | B')).toBe('(A | B)');
		expect(group("'a|b'")).toBe("'a|b'");
		expect(group('{ a: A | B }')).toBe('{ a: A | B }');
		expect(group('A & B', '|')).toBe('A & B');
	});
});
