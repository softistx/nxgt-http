/** The table of `nxgt-scalars.ts` against the package it names, which the generator never imports. */
import { describe, expect, it } from 'bun:test';
import * as nxgtZod from '@nxgt/zod';
import { scalarSchemas } from '@nxgt/zod';
import { toJSONSchema } from 'zod';
import {
	CODEC_SCALARS,
	exactNumberScalar,
	exactSchema,
	isNxgtScalar,
	NUMBER_SCALARS,
	type NumberBounds,
	STRING_SCALARS,
} from './nxgt-scalars';

/** Declared by @nxgt/zod, but no scalar of @nxgt/typespec: JSON values and `void`. */
const BUILTINS = ['JSON', 'JSONObject', 'Void'];

const names = Object.keys(scalarSchemas);

describe('STRING_SCALARS', () => {
	it('is every scalar of @nxgt/zod, but the builtins, the codecs and the numbers', () => {
		const left = new Set([
			...BUILTINS,
			...CODEC_SCALARS,
			...Object.keys(NUMBER_SCALARS),
		]);
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
		for (const name of [...CODEC_SCALARS, ...Object.keys(NUMBER_SCALARS)]) {
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

describe('NUMBER_SCALARS', () => {
	it('names, for each scalar, the export that is its schema', () => {
		const exports = nxgtZod as Record<string, unknown>;
		for (const [name, { schema }] of Object.entries(NUMBER_SCALARS)) {
			expect(schema, name).toMatch(/^[a-z][A-Za-z0-9]*Schema$/);
			expect(exports[schema], name).toBe(
				(scalarSchemas as Record<string, unknown>)[name],
			);
		}
	});

	it('says, for each, whether its schema is an integer', () => {
		for (const [name, { integer }] of Object.entries(NUMBER_SCALARS)) {
			const json = toJSONSchema(
				scalarSchemas[name as keyof typeof scalarSchemas],
			);
			expect(json.type, name).toBe(integer ? 'integer' : 'number');
		}
	});

	it('holds, for each, the bounds its schema enforces', () => {
		for (const [name, { bounds }] of Object.entries(NUMBER_SCALARS)) {
			const { $schema, type, ...json } = toJSONSchema(
				scalarSchemas[name as keyof typeof scalarSchemas],
			);
			expect(bounds, name).toEqual(json as NumberBounds);
		}
	});

	it('is a number schema that is not a codec', () => {
		for (const name of Object.keys(NUMBER_SCALARS)) {
			expect(
				scalarSchemas[name as keyof typeof scalarSchemas]._zod.def.type,
				name,
			).toBe('number');
		}
	});
});

describe('exactNumberScalar', () => {
	it('knows a name exactly, and an integer exactly when the schema is', () => {
		expect(exactNumberScalar('Port', true)?.schema).toBe('portSchema');
		expect(exactNumberScalar('Port', false)).toBeUndefined();
		expect(exactNumberScalar('PositiveFloat', false)?.schema).toBe(
			'positiveFloatSchema',
		);
		expect(exactNumberScalar('PositiveFloat', true)).toBeUndefined();
		expect(exactNumberScalar('IBAN', false)).toBeUndefined();
		expect(exactNumberScalar('toString', false)).toBeUndefined();
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
