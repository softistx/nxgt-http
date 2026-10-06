import { describe, expect, it } from 'bun:test';
import { Diagnostics } from '../../errors';
import type { Location } from '../../loader/location';
import type { ObjectNode, SchemaNode } from '../types';
import { typedNode, typesOf } from './typed';

const at: Location = { file: '/spec/openapi.json', pointer: '/s' };

const state = () => ({
	diagnostics: new Diagnostics(),
	warnedFormats: new Set<string>(),
	requiring: new Map<ObjectNode, Location>(),
	undeclared: new WeakSet<SchemaNode>(),
	node: (_value: unknown, where: Location): SchemaNode => ({
		kind: 'ref',
		target: where.pointer,
	}),
});

describe('typesOf', () => {
	it('has nothing to say without a `type`', () => {
		expect(typesOf(state(), {}, at)).toEqual({
			types: [],
			nullable: false,
			any: false,
		});
	});

	it('takes `null` out of the list and into `nullable`', () => {
		expect(typesOf(state(), { type: ['string', 'null'] }, at)).toEqual({
			types: ['string'],
			nullable: true,
			any: false,
		});
		expect(typesOf(state(), { type: 'null' }, at)).toEqual({
			types: [],
			nullable: true,
			any: false,
		});
	});

	it('lists a type once', () => {
		expect(typesOf(state(), { type: ['string', 'string'] }, at).types).toEqual([
			'string',
		]);
	});

	it('drops `integer` beside `number`, which admits every integer', () => {
		expect(typesOf(state(), { type: ['integer', 'number'] }, at).types).toEqual(
			['number'],
		);
		expect(typesOf(state(), { type: ['integer', 'string'] }, at).types).toEqual(
			['integer', 'string'],
		);
	});

	it('takes anything when every type and `null` are listed, but not without `null`', () => {
		const all = ['string', 'number', 'boolean', 'array', 'object'];
		expect(typesOf(state(), { type: [...all, 'null'] }, at).any).toBe(true);
		expect(typesOf(state(), { type: all }, at).any).toBe(false);
		expect(
			typesOf(state(), { type: ['string', 'integer', 'null'] }, at).any,
		).toBe(false);
	});

	it('refuses a type that is no JSON Schema type, at `type`, and carries on with the rest', () => {
		const s = state();
		expect(typesOf(s, { type: ['string', 'date', 5] }, at).types).toEqual([
			'string',
		]);
		expect(
			s.diagnostics.list.map(({ code, message, pointer }) => ({
				code,
				message,
				pointer,
			})),
		).toEqual([
			{
				code: 'invalid_schema',
				message: '`type: "date"` is not a JSON Schema type',
				pointer: '/s/type',
			},
			{
				code: 'invalid_schema',
				message: '`type: 5` is not a JSON Schema type',
				pointer: '/s/type',
			},
		]);
	});
});

describe('typedNode', () => {
	it('builds the node of each JSON type', () => {
		const kind = (type: string) => typedNode(state(), { type }, at).kind;
		expect(kind('string')).toBe('string');
		expect(kind('integer')).toBe('number');
		expect(kind('number')).toBe('number');
		expect(kind('boolean')).toBe('boolean');
		expect(kind('array')).toBe('array');
		expect(kind('null')).toBe('null');
		expect(typedNode(state(), { type: 'integer' }, at)).toMatchObject({
			integer: true,
		});
		expect(typedNode(state(), { type: 'number' }, at)).toMatchObject({
			integer: false,
		});
	});

	it('hands `type: object` to the object builder', () => {
		expect(
			typedNode(state(), { type: 'object', properties: { a: {} } }, at),
		).toMatchObject({ kind: 'object', properties: [{ name: 'a' }] });
	});

	it('marks a node nullable for `[T, "null"]`', () => {
		expect(typedNode(state(), { type: ['string', 'null'] }, at)).toEqual({
			kind: 'string',
			nullable: true,
		});
	});

	it('is a non-exclusive union of the types, each built from the same keywords', () => {
		expect(
			typedNode(
				state(),
				{ type: ['string', 'integer'], minLength: 2, minimum: 3 },
				at,
			),
		).toEqual({
			kind: 'union',
			exclusive: false,
			variants: [
				{ kind: 'string', minLength: 2 },
				{ kind: 'number', integer: true, minimum: 3 },
			],
		});
	});

	it('is a nullable union when the types are several and `null` is one', () => {
		expect(
			typedNode(state(), { type: ['string', 'boolean', 'null'] }, at),
		).toMatchObject({ kind: 'union', nullable: true });
	});

	it('is `unknown`, still marked nullable, when every type is listed with `null`', () => {
		expect(
			typedNode(
				state(),
				{ type: ['string', 'number', 'boolean', 'array', 'object', 'null'] },
				at,
			),
		).toEqual({ kind: 'unknown', nullable: true });
	});

	it('is `unknown` for an invalid type and no other', () => {
		const s = state();
		expect(typedNode(s, { type: 'date' }, at)).toEqual({ kind: 'unknown' });
		expect(s.diagnostics.hasErrors).toBe(true);
	});

	describe('without a type', () => {
		it('is `unknown` for an empty schema', () => {
			expect(typedNode(state(), {}, at)).toEqual({ kind: 'unknown' });
		});

		it('is an object for `properties`, `required` or extra keys', () => {
			for (const s of [
				{ properties: { a: {} } },
				{ required: ['a'] },
				{ additionalProperties: false },
			]) {
				expect(typedNode(state(), s, at).kind).toBe('object');
			}
			expect(typedNode(state(), { additionalProperties: true }, at)).toEqual({
				kind: 'record',
				values: { kind: 'unknown' },
			});
		});

		it('is an array for `items`', () => {
			expect(typedNode(state(), { items: {} }, at).kind).toBe('array');
		});

		it('is a number for a numeric bound, never an integer', () => {
			for (const key of [
				'minimum',
				'maximum',
				'exclusiveMinimum',
				'exclusiveMaximum',
				'multipleOf',
			]) {
				expect(typedNode(state(), { [key]: 1 }, at)).toMatchObject({
					kind: 'number',
					integer: false,
				});
			}
		});

		it('is a string for a string keyword', () => {
			for (const s of [
				{ minLength: 1 },
				{ maxLength: 1 },
				{ pattern: 'a' },
				{ format: 'email' },
				{ contentEncoding: 'base64' },
			]) {
				expect(typedNode(state(), s, at).kind).toBe('string');
			}
			expect(
				typedNode(state(), { contentMediaType: 'image/png' }, at).kind,
			).toBe('binary');
		});

		it('prefers an object over an array over a number over a string', () => {
			expect(typedNode(state(), { properties: {}, items: {} }, at).kind).toBe(
				'record',
			);
			expect(typedNode(state(), { items: {}, minimum: 1 }, at).kind).toBe(
				'array',
			);
			expect(typedNode(state(), { minimum: 1, minLength: 1 }, at).kind).toBe(
				'number',
			);
		});

		it('is `null` for `type: null`, whose list holds nothing else', () => {
			expect(typedNode(state(), { type: 'null' }, at)).toEqual({
				kind: 'null',
			});
		});

		it('warns that a list or object bound with no `type` is not enforced, naming the first', () => {
			const s = state();
			expect(
				typedNode(s, { maxItems: 3, minProperties: 1, uniqueItems: true }, at),
			).toEqual({ kind: 'unknown' });
			expect(
				s.diagnostics.list.map(({ severity, code, message, pointer }) => ({
					severity,
					code,
					message,
					pointer,
				})),
			).toEqual([
				{
					severity: 'warning',
					code: 'not_enforced',
					message:
						'`maxItems` without a `type` is not enforced: give the schema a `type`',
					pointer: '/s/maxItems',
				},
			]);
		});
	});
});
