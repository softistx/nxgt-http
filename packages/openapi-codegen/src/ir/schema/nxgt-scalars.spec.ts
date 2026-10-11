/** The table of `nxgt-zod.ts` against the package it names, which the generator never imports. */
import { describe, expect, it } from 'bun:test';
import * as nxgtZod from '@nxgt/zod';
import { scalarSchemas } from '@nxgt/zod';
import {
	CODEC_SCALARS,
	exactSchema,
	isNxgtScalar,
	NUMBER_SCALARS,
	STRING_SCALARS,
} from './nxgt-scalars';

/** Declared by @nxgt/zod, but no scalar of @nxgt/typespec: JSON values and `void`. */
const BUILTINS = ['JSON', 'JSONObject', 'Void'];

const names = Object.keys(scalarSchemas);

describe('STRING_SCALARS', () => {
	it('is every scalar of @nxgt/zod, but the builtins, the codecs and the numbers', () => {
		const left = new Set([...BUILTINS, ...CODEC_SCALARS, ...NUMBER_SCALARS]);
		expect(Object.keys(STRING_SCALARS).sort()).toEqual(
			names.filter((name) => !left.has(name)).sort(),
		);
	});

	it('names, for each scalar, the export that is its schema', () => {
		const exports = nxgtZod as Record<string, unknown>;
		for (const [name, exported] of Object.entries(STRING_SCALARS)) {
			expect(exported, name).toMatch(/^[a-z][A-Za-z0-9]*Schema$/);
			expect(exports[exported], name).toBe(
				(scalarSchemas as Record<string, unknown>)[name],
			);
		}
	});

	it('leaves the codecs and the numbers out, and knows them', () => {
		for (const name of [...CODEC_SCALARS, ...NUMBER_SCALARS]) {
			expect(names, name).toContain(name);
			expect(exactSchema(name), name).toBeUndefined();
			expect(isNxgtScalar(name), name).toBe(true);
		}
	});

	it('leaves out what is not a string schema: a codec changes the output type', () => {
		for (const name of CODEC_SCALARS) {
			expect(
				scalarSchemas[name as keyof typeof scalarSchemas]._zod.def.type,
			).toBe('pipe');
		}
	});
});

describe('exactSchema and isNxgtScalar', () => {
	it('know a name exactly', () => {
		expect(exactSchema('IBAN')).toBe('ibanSchema');
		expect(exactSchema('iban')).toBeUndefined();
		expect(exactSchema('toString')).toBeUndefined();
		expect(isNxgtScalar('IBAN')).toBe(true);
		expect(isNxgtScalar('Iban')).toBe(false);
	});
});
