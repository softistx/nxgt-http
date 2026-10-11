import { describe, expect, it } from 'bun:test';
import {
	exactScalar,
	lengthChecks,
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
