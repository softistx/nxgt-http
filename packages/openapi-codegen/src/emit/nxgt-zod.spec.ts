import { describe, expect, it } from 'bun:test';
import {
	exactScalar,
	lengthChecks,
	numberChecks,
	nxgtImport,
	patternChecks,
} from './nxgt-zod';

describe('exactScalar', () => {
	const iban = { kind: 'string', scalar: 'IBAN' } as const;

	it('is the export of a string scalar, in exact mode only', () => {
		expect(exactScalar({ scalars: 'exact' }, iban)).toBe('ibanSchema');
		expect(exactScalar({ scalars: 'pattern' }, iban)).toBeUndefined();
		expect(exactScalar({}, iban)).toBeUndefined();
	});

	it('is none for a codec, a plain string, an unknown scalar or another kind', () => {
		const exact = { scalars: 'exact' } as const;
		expect(
			exactScalar(exact, { kind: 'string', scalar: 'DateTime' }),
		).toBeUndefined();
		expect(exactScalar(exact, { kind: 'string' })).toBeUndefined();
		expect(
			exactScalar(exact, { kind: 'string', scalar: 'Nope' }),
		).toBeUndefined();
		expect(
			exactScalar(exact, { kind: 'number', integer: true }),
		).toBeUndefined();
	});
});

describe('exactScalar for a number', () => {
	const exact = { scalars: 'exact' } as const;

	it('is the export of a numeric scalar, when the spec is an integer exactly as the scalar is', () => {
		const port = { kind: 'number', integer: true, scalar: 'Port' } as const;
		expect(exactScalar(exact, port)).toBe('portSchema');
		expect(exactScalar({ scalars: 'pattern' }, port)).toBeUndefined();
		expect(exactScalar(exact, { ...port, integer: false })).toBeUndefined();
		expect(
			exactScalar(exact, { kind: 'number', integer: false, scalar: 'Port' }),
		).toBeUndefined();
		expect(
			exactScalar(exact, { kind: 'number', integer: true, scalar: 'IBAN' }),
		).toBeUndefined();
	});
});

describe('numberChecks', () => {
	const port = { kind: 'number', integer: true, scalar: 'Port' } as const;

	it('is nothing without a bound, and for a bound the scalar already enforces', () => {
		expect(numberChecks({ kind: 'number', integer: false })).toBe('');
		expect(numberChecks(port)).toBe('');
		expect(numberChecks({ ...port, minimum: 0, maximum: 65535 })).toBe('');
		expect(numberChecks({ ...port, minimum: -5, maximum: 70000 })).toBe('');
	});

	it('is a check per bound the scalar does not enforce, with the message Zod gives', () => {
		expect(numberChecks({ ...port, minimum: 1024, maximum: 49151 })).toBe(
			".check(z.gte(1024, 'Too small: expected number to be >=1024'), z.lte(49151, 'Too big: expected number to be <=49151'))",
		);
		expect(
			numberChecks({
				kind: 'number',
				integer: false,
				scalar: 'PositiveFloat',
				exclusiveMaximum: 10,
				multipleOf: 0.5,
			}),
		).toBe(
			".check(z.lt(10, 'Too big: expected number to be <10'), z.multipleOf(0.5, 'Invalid number: must be a multiple of 0.5'))",
		);
	});

	it('weighs an exclusive bound of an integer scalar as the inclusive one next to it', () => {
		const positive = {
			kind: 'number',
			integer: true,
			scalar: 'PositiveInt',
		} as const;
		// 1 <= n is 0 < n for an integer: implied.
		expect(numberChecks({ ...positive, minimum: 1 })).toBe('');
		expect(numberChecks({ ...positive, exclusiveMinimum: 0 })).toBe('');
		expect(numberChecks({ ...positive, minimum: 2 })).toContain('z.gte(2,');
		const negative = {
			kind: 'number',
			integer: true,
			scalar: 'NegativeInt',
		} as const;
		expect(numberChecks({ ...negative, maximum: -1 })).toBe('');
	});

	it('does not weigh an exclusive bound of a float scalar as an integer one', () => {
		const positive = {
			kind: 'number',
			integer: false,
			scalar: 'PositiveFloat',
		} as const;
		expect(numberChecks({ ...positive, exclusiveMinimum: 0 })).toBe('');
		expect(numberChecks({ ...positive, minimum: 0 })).toBe('');
		// 0 < x does not imply 1e-9 <= x.
		expect(numberChecks({ ...positive, minimum: 1e-9 })).toContain('z.gte(');
		const nonNegative = {
			kind: 'number',
			integer: false,
			scalar: 'NonNegativeFloat',
		} as const;
		// 0 <= x does not imply 0 < x.
		expect(numberChecks({ ...nonNegative, exclusiveMinimum: 0 })).toContain(
			'z.gt(0,',
		);
	});

	it('keeps every bound of a number that is no known scalar', () => {
		expect(
			numberChecks({ kind: 'number', integer: true, minimum: 1, maximum: 9 }),
		).toBe(
			".check(z.gte(1, 'Too small: expected number to be >=1'), z.lte(9, 'Too big: expected number to be <=9'))",
		);
	});
});

describe('lengthChecks', () => {
	it('is nothing without a bound', () => {
		expect(lengthChecks({ kind: 'string' })).toBe('');
	});

	it('is a check per bound, with the message Zod gives, which the scalar would override', () => {
		expect(lengthChecks({ kind: 'string', minLength: 2, maxLength: 9 })).toBe(
			".check(z.minLength(2, 'Too small: expected string to have >=2 characters'), z.maxLength(9, 'Too big: expected string to have <=9 characters'))",
		);
	});
});

describe('patternChecks', () => {
	it('is nothing without a pattern', () => {
		expect(patternChecks({ kind: 'string' })).toBe('');
	});

	it('keeps the pattern of the spec as a check, on top of the scalar', () => {
		expect(patternChecks({ kind: 'string', pattern: '^FR\\d+$' })).toBe(
			".check(z.regex(/^FR\\d+$/u, 'Invalid string: must match pattern /^FR\\\\d+$/u'))",
		);
	});
});

describe('nxgtImport', () => {
	it('is one sorted import of the @nxgt/zod exports, without z, and nothing otherwise', () => {
		expect(nxgtImport(['z'])).toEqual([]);
		expect(nxgtImport([])).toEqual([]);
		expect(nxgtImport(['z', 'ipSchema', 'ibanSchema', 'ipSchema'])).toEqual([
			"import { ibanSchema, ipSchema } from '@nxgt/zod';",
		]);
	});
});
