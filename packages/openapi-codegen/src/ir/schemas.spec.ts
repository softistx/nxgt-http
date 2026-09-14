import { describe, expect, it } from 'bun:test';
import { CodegenError } from '../errors';
import { loadDocument } from '../loader/document';
import { createMemoryFileSystem } from '../loader/fs';
import { buildIR, type IROptions } from './index';
import type { SchemaNode } from './types';

const ROOT = '/spec/openapi.json';

const spec = (schemas: Record<string, unknown>) =>
	JSON.stringify({
		openapi: '3.2.0',
		info: { title: 't', version: '1' },
		paths: {},
		components: { schemas },
	});

const build = async (
	schemas: Record<string, unknown>,
	options?: IROptions,
	files: Record<string, string> = {},
) =>
	buildIR(
		await loadDocument(ROOT, {
			fs: createMemoryFileSystem({ [ROOT]: spec(schemas), ...files }),
		}),
		options,
	);

/** Builds a spec with these components, and finds schemas by name. */
async function components(
	schemas: Record<string, unknown>,
	options?: IROptions,
	files?: Record<string, string>,
) {
	const api = await build(schemas, options, files);
	const byName = Object.fromEntries(api.schemas.map((s) => [s.name, s]));
	const node = (name: string): SchemaNode => {
		const found = byName[name];
		if (!found) throw new Error(`no schema named ${name}`);
		return found.node;
	};
	return { api, byName, node };
}

const nodeOf = async (schema: unknown) =>
	(await components({ S: schema })).node('S');

async function errors(
	schemas: Record<string, unknown>,
	options?: IROptions,
	files?: Record<string, string>,
) {
	const error = await build(schemas, options, files).catch((e: unknown) => e);
	if (!(error instanceof CodegenError))
		throw new Error('expected a CodegenError');
	return error.diagnostics
		.filter((d) => d.severity === 'error')
		.map(({ code, pointer }) => ({ code, pointer }));
}

const id = (name: string) => `${ROOT}#/components/schemas/${name}`;
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });

describe('buildIR — scalars', () => {
	it('keeps string constraints', async () => {
		expect(
			await nodeOf({
				type: 'string',
				minLength: 1,
				maxLength: 5,
				pattern: '^a',
			}),
		).toEqual({ kind: 'string', minLength: 1, maxLength: 5, pattern: '^a' });
	});

	it('keeps the formats Zod validates, and marks binary content', async () => {
		const { node } = await components({
			When: { type: 'string', format: 'date-time' },
			Raw: { type: 'string', format: 'binary' },
			Upload: { type: 'string', contentMediaType: 'application/octet-stream' },
			Base64: { type: 'string', contentEncoding: 'base64' },
		});
		expect(node('When')).toEqual({ kind: 'string', format: 'date-time' });
		expect(node('Raw')).toEqual({ kind: 'binary' });
		expect(node('Upload')).toEqual({ kind: 'binary' });
		expect(node('Base64')).toEqual({ kind: 'string', format: 'byte' });
	});

	it('checks an unknown format as a plain string, warning once per format', async () => {
		const { api, node } = await components({
			A: { type: 'string', format: 'objectid' },
			B: { type: 'string', format: 'objectid' },
		});
		expect(node('B')).toEqual({ kind: 'string' });
		expect(api.warnings.map((w) => w.code)).toEqual(['unknown_format']);
	});

	it('keeps numeric bounds, with 3.1 exclusive bounds', async () => {
		expect(
			await nodeOf({
				type: 'integer',
				format: 'int32',
				minimum: 0,
				exclusiveMaximum: 10,
			}),
		).toEqual({
			kind: 'number',
			integer: true,
			format: 'int32',
			minimum: 0,
			exclusiveMaximum: 10,
		});
	});

	it('refuses a 3.0 boolean exclusiveMinimum', async () => {
		expect(
			await errors({ S: { type: 'number', exclusiveMinimum: true } }),
		).toEqual([
			{
				code: 'invalid_schema',
				pointer: '/components/schemas/S/exclusiveMinimum',
			},
		]);
	});

	it('keeps a default, null included', async () => {
		expect(await nodeOf({ type: 'integer', default: 20 })).toEqual({
			kind: 'number',
			integer: true,
			default: { value: 20 },
		});
		expect(await nodeOf({ type: ['string', 'null'], default: null })).toEqual({
			kind: 'string',
			nullable: true,
			default: { value: null },
		});
	});
});

describe('buildIR — null', () => {
	it('reads `type: [T, "null"]` as nullable', async () => {
		expect(await nodeOf({ type: ['string', 'null'] })).toEqual({
			kind: 'string',
			nullable: true,
		});
	});

	it('reads 3.0 `nullable: true` the same, warning once per file', async () => {
		const { api, node } = await components({
			A: { type: 'string', nullable: true },
			B: { type: 'integer', nullable: true },
		});
		expect(node('A')).toEqual({ kind: 'string', nullable: true });
		expect(api.warnings.map((w) => w.code)).toEqual(['legacy_nullable']);
	});

	it('refuses 3.0 `nullable: true` when told to', async () => {
		expect(
			await errors(
				{ A: { type: 'string', nullable: true } },
				{ legacyNullable: 'error' },
			),
		).toEqual([
			{ code: 'legacy_nullable', pointer: '/components/schemas/A/nullable' },
		]);
	});
});

describe('buildIR — objects', () => {
	it('marks required properties and leaves the others optional', async () => {
		expect(
			await nodeOf({
				type: 'object',
				required: ['id'],
				properties: { id: { type: 'string' }, note: { type: 'string' } },
			}),
		).toEqual({
			kind: 'object',
			additional: 'default',
			extends: [],
			properties: [
				{ name: 'id', required: true, schema: { kind: 'string' } },
				{ name: 'note', required: false, schema: { kind: 'string' } },
			],
		});
	});

	it('maps additionalProperties, and an object that declares nothing to a map', async () => {
		const a = { a: { type: 'string' } };
		const { node } = await components({
			Strict: { type: 'object', additionalProperties: false, properties: a },
			Loose: { type: 'object', additionalProperties: true, properties: a },
			Catchall: {
				type: 'object',
				additionalProperties: { type: 'integer' },
				properties: a,
			},
			Map: { type: 'object', additionalProperties: { type: 'integer' } },
			Anything: { type: 'object' },
		});
		const integer = { kind: 'number', integer: true } as const;
		expect(node('Strict')).toMatchObject({
			kind: 'object',
			additional: 'strict',
		});
		expect(node('Loose')).toMatchObject({
			kind: 'object',
			additional: 'loose',
		});
		expect(node('Catchall')).toMatchObject({
			kind: 'object',
			additional: { schema: integer },
		});
		expect(node('Map')).toEqual({ kind: 'record', values: integer });
		expect(node('Anything')).toEqual({
			kind: 'record',
			values: { kind: 'unknown' },
		});
	});

	it('maps {} to unknown and false to never', async () => {
		expect(
			await nodeOf({ type: 'object', properties: { any: {}, none: false } }),
		).toMatchObject({
			properties: [
				{ name: 'any', schema: { kind: 'unknown' } },
				{ name: 'none', schema: { kind: 'never' } },
			],
		});
	});
});

describe('buildIR — literals, lists and unions', () => {
	it('maps enum and const to literals, a null member to nullable', async () => {
		const { node } = await components({
			Status: { type: ['string', 'null'], enum: ['active', 'left', null] },
			One: { const: 1 },
		});
		expect(node('Status')).toEqual({
			kind: 'literal',
			values: ['active', 'left'],
			nullable: true,
		});
		expect(node('One')).toEqual({ kind: 'literal', values: [1] });
	});

	it('maps a list of types to a union', async () => {
		expect(await nodeOf({ type: ['string', 'integer'] })).toEqual({
			kind: 'union',
			exclusive: false,
			variants: [{ kind: 'string' }, { kind: 'number', integer: true }],
		});
	});

	it('maps arrays, and warns that uniqueItems is not enforced', async () => {
		const { api, node } = await components({
			Item: { type: 'string' },
			List: {
				type: 'array',
				items: ref('Item'),
				minItems: 1,
				uniqueItems: true,
			},
			Untyped: { type: 'array' },
		});
		expect(node('List')).toEqual({
			kind: 'array',
			items: { kind: 'ref', target: id('Item') },
			minItems: 1,
		});
		expect(node('Untyped')).toEqual({
			kind: 'array',
			items: { kind: 'unknown' },
		});
		expect(api.warnings.map((w) => w.code)).toEqual(['not_enforced']);
	});

	it('maps oneOf, folding a null variant into nullable', async () => {
		const { node } = await components({
			A: { type: 'string' },
			B: { type: 'integer' },
			S: { oneOf: [ref('A'), ref('B'), { type: 'null' }] },
		});
		expect(node('S')).toEqual({
			kind: 'union',
			exclusive: true,
			nullable: true,
			variants: [
				{ kind: 'ref', target: id('A') },
				{ kind: 'ref', target: id('B') },
			],
		});
	});

	const cat = {
		type: 'object',
		required: ['kind'],
		properties: { kind: { const: 'cat' } },
	};

	it('keeps a discriminator every variant can answer', async () => {
		const { api, node } = await components({
			Cat: cat,
			Dog: {
				type: 'object',
				required: ['kind'],
				properties: { kind: { type: 'string', enum: ['dog'] } },
			},
			Pet: {
				oneOf: [ref('Cat'), ref('Dog')],
				discriminator: { propertyName: 'kind' },
			},
		});
		expect(node('Pet')).toMatchObject({ kind: 'union', discriminator: 'kind' });
		expect(api.warnings).toEqual([]);
	});

	it('falls back to a plain union, with a warning, when a variant cannot answer it', async () => {
		const { api, node } = await components({
			Cat: cat,
			Dog: {
				type: 'object',
				required: ['kind'],
				properties: { kind: { type: 'string' } },
			},
			Pet: {
				oneOf: [ref('Cat'), ref('Dog')],
				discriminator: { propertyName: 'kind' },
			},
		});
		expect(
			(node('Pet') as { discriminator?: string }).discriminator,
		).toBeUndefined();
		expect(api.warnings.map((w) => [w.code, w.pointer])).toEqual([
			['discriminator_fallback', '/components/schemas/Pet/discriminator'],
		]);
	});
});

describe('buildIR — unevaluatedProperties', () => {
	const card = {
		type: 'object',
		properties: { number: { type: 'string' } },
	};

	it('makes an object strict, and leaves one whose extra keys are allowed', async () => {
		const { node } = await components({
			S: { ...card, unevaluatedProperties: false },
			L: { ...card, additionalProperties: true, unevaluatedProperties: false },
			T: { ...card, unevaluatedProperties: true },
		});
		expect(node('S')).toMatchObject({ kind: 'object', additional: 'strict' });
		expect(node('L')).toMatchObject({ kind: 'object', additional: 'loose' });
		expect(node('T')).toMatchObject({ kind: 'object', additional: 'default' });
	});

	it('seals a union: its inline variants strict, its $ref variants marked', async () => {
		const { node } = await components({
			Card: card,
			P: {
				unevaluatedProperties: false,
				oneOf: [
					ref('Card'),
					{ type: 'object', properties: { iban: { type: 'string' } } },
				],
			},
			R: { $ref: '#/components/schemas/Card', unevaluatedProperties: false },
		});
		expect(node('P')).toMatchObject({
			kind: 'union',
			sealed: true,
			variants: [
				{ kind: 'ref', target: id('Card'), sealed: true },
				{ kind: 'object', additional: 'strict' },
			],
		});
		expect(node('R')).toMatchObject({ kind: 'ref', sealed: true });
	});

	it('seals an object that declares nothing to accept only {}', async () => {
		const { node } = await components({
			E: { type: 'object', unevaluatedProperties: false },
			U: { oneOf: [card, { type: 'object' }], unevaluatedProperties: false },
			Open: {
				type: 'object',
				additionalProperties: true,
				unevaluatedProperties: false,
			},
		});
		const empty = { kind: 'object', properties: [], additional: 'strict' };
		expect(node('E')).toMatchObject(empty);
		expect(node('U')).toMatchObject({ variants: [{ kind: 'object' }, empty] });
		// Every key is evaluated by `additionalProperties`: it still takes anything.
		expect(node('Open')).toMatchObject({ kind: 'record' });
	});

	it('refuses unevaluatedProperties with a schema, or over anyOf', async () => {
		for (const [name, schema] of [
			['S', { ...card, unevaluatedProperties: { type: 'string' } }],
			['A', { unevaluatedProperties: false, anyOf: [card, card] }],
		] as const) {
			const error = await build({ [name]: schema }).catch(
				(caught: unknown) => caught,
			);
			expect(error).toBeInstanceOf(CodegenError);
			expect(
				(error as CodegenError).diagnostics.map((d) => [d.code, d.pointer]),
			).toEqual([
				[
					'unsupported_keyword',
					`/components/schemas/${name}/unevaluatedProperties`,
				],
			]);
		}
	});
});

describe('buildIR — allOf and $ref', () => {
	const base = { type: 'object', properties: { id: { type: 'string' } } };

	it('makes allOf over objects an object that extends its named parents', async () => {
		const { node } = await components({
			Base: base,
			S: {
				allOf: [
					ref('Base'),
					{
						type: 'object',
						required: ['name'],
						properties: { name: { type: 'string' } },
					},
				],
				required: ['id'],
			},
		});
		expect(node('S')).toEqual({
			kind: 'object',
			extends: [id('Base')],
			additional: 'default',
			properties: [
				{ name: 'name', required: true, schema: { kind: 'string' } },
			],
			requires: ['id'],
		});
	});

	it('falls back to an intersection when a member is not an object', async () => {
		const { node } = await components({
			Base: base,
			Either: {
				oneOf: [
					{ type: 'object', properties: { a: { type: 'string' } } },
					{ type: 'object', properties: { b: { type: 'string' } } },
				],
			},
			WithString: { allOf: [ref('Base'), { type: 'string' }] },
			OnUnion: {
				allOf: [
					ref('Either'),
					{ type: 'object', properties: { x: { type: 'string' } } },
				],
			},
		});
		expect(node('WithString')).toEqual({
			kind: 'intersection',
			members: [{ kind: 'ref', target: id('Base') }, { kind: 'string' }],
		});
		expect(node('OnUnion')).toEqual({
			kind: 'intersection',
			members: [
				{ kind: 'ref', target: id('Either') },
				{
					kind: 'object',
					extends: [],
					additional: 'default',
					properties: [
						{ name: 'x', required: false, schema: { kind: 'string' } },
					],
				},
			],
		});
	});

	it('keeps annotations next to a $ref, and applies other keywords with it', async () => {
		const { node } = await components({
			Id: { type: 'string' },
			S: {
				type: 'object',
				properties: {
					described: { ...ref('Id'), description: 'the id' },
					nullable: { ...ref('Id'), nullable: true },
					narrowed: { ...ref('Id'), minLength: 2 },
				},
			},
		});
		const target = id('Id');
		expect(node('S')).toMatchObject({
			properties: [
				{ schema: { kind: 'ref', target, description: 'the id' } },
				{ schema: { kind: 'ref', target, nullable: true } },
				{
					schema: {
						kind: 'intersection',
						members: [
							{ kind: 'ref', target },
							{ kind: 'string', minLength: 2 },
						],
					},
				},
			],
		});
	});
});

describe('buildIR — names and order', () => {
	it('marks recursion and puts dependencies first', async () => {
		const { api } = await components({
			Tree: { type: 'object', properties: { root: ref('Node') } },
			Node: {
				type: 'object',
				properties: { children: { type: 'array', items: ref('Node') } },
			},
		});
		expect(api.schemas.map((s) => [s.name, s.recursive])).toEqual([
			['Node', true],
			['Tree', false],
		]);
	});

	const status = {
		'/spec/schemas/employee-status.json': JSON.stringify({
			type: 'string',
			enum: ['active'],
		}),
	};
	const usesStatus = {
		type: 'object',
		properties: { status: { $ref: './schemas/employee-status.json' } },
	};

	it('names a referenced file after its basename', async () => {
		const { byName } = await components({ Employee: usesStatus }, {}, status);
		expect(byName.EmployeeStatus?.source).toBe('ref');
	});

	it('refuses two schemas that would share a name, and `names` settles it', async () => {
		const input = { EmployeeStatus: { type: 'string' }, Employee: usesStatus };
		expect(await errors(input, {}, status)).toEqual([
			{ code: 'name_collision', pointer: '' },
		]);
		const { byName } = await components(
			input,
			{ names: { 'schemas/employee-status.json': 'EmploymentStatus' } },
			status,
		);
		expect(byName.EmploymentStatus?.source).toBe('ref');
	});

	it('makes a second component naming the same schema an alias', async () => {
		const { api } = await components({
			Id: { type: 'string' },
			Identifier: ref('Id'),
		});
		expect(api.aliases.map((a) => [a.name, a.target])).toEqual([
			['Identifier', id('Id')],
		]);
	});

	it('refuses what it cannot express, every keyword at once', async () => {
		expect(
			await errors({
				S: {
					type: 'object',
					not: { type: 'string' },
					if: {},
					// biome-ignore lint/suspicious/noThenProperty: the JSON Schema keyword under test
					then: {},
					patternProperties: {},
				},
			}),
		).toEqual(
			['not', 'if', 'then', 'patternProperties'].map((keyword) => ({
				code: 'unsupported_keyword',
				pointer: `/components/schemas/S/${keyword}`,
			})),
		);
	});
});

describe('buildIR — nothing dropped silently', () => {
	const object = (properties: Record<string, unknown>, extra = {}) => ({
		type: 'object',
		properties,
		...extra,
	});
	const a = { a: { type: 'string' } };

	it('refuses an unsupported keyword next to a $ref', async () => {
		expect(
			await errors({
				A: object(a),
				S: { $ref: '#/components/schemas/A', not: { required: ['a'] } },
			}),
		).toEqual([
			{ code: 'unsupported_keyword', pointer: '/components/schemas/S/not' },
		]);
	});

	it('requires a key the $ref declares, when `required` sits beside it', async () => {
		const { node } = await components({
			A: object(a),
			S: { $ref: '#/components/schemas/A', required: ['a'] },
		});
		expect(node('S')).toMatchObject({
			kind: 'object',
			extends: [id('A')],
			requires: ['a'],
		});
	});

	it('requires a key no property declares, or says it is not checked', async () => {
		const { api, node } = await components({
			Map: {
				type: 'object',
				required: ['id'],
				additionalProperties: { type: 'string' },
			},
			Open: { type: 'object', required: ['id'] },
		});
		expect(node('Map')).toMatchObject({
			kind: 'object',
			properties: [{ name: 'id', required: true, schema: { kind: 'string' } }],
		});
		expect(node('Open')).toEqual({
			kind: 'record',
			values: { kind: 'unknown' },
		});
		expect(api.warnings.map((w) => [w.code, w.pointer])).toEqual([
			['not_enforced', '/components/schemas/Open/required'],
		]);
	});

	it('keeps `required` next to an allOf that has properties', async () => {
		const { node } = await components({
			Base: object({ id: { type: 'string' } }),
			S: {
				allOf: [ref('Base')],
				properties: a,
				required: ['id', 'a'],
			},
		});
		expect(node('S')).toMatchObject({
			kind: 'object',
			extends: [id('Base')],
			properties: [{ name: 'a', required: true }],
			requires: ['id'],
		});
	});

	it('meets a property two allOf members declare, and warns on a strict member', async () => {
		const { api, node } = await components({
			S: {
				allOf: [
					object(
						{ a: { type: 'string', format: 'email' } },
						{ required: ['a'], additionalProperties: false },
					),
					object({ a: { description: 'note' }, b: { type: 'string' } }),
				],
			},
		});
		expect(node('S')).toMatchObject({
			kind: 'object',
			properties: [
				{
					name: 'a',
					required: true,
					schema: { kind: 'string', format: 'email', description: 'note' },
				},
				{ name: 'b' },
			],
		});
		expect(api.warnings.map((w) => w.code)).toEqual(['not_enforced']);
	});

	it('meets a property a child restates over its parent, keeping it required', async () => {
		const { node } = await components({
			Base: object(a, { required: ['a'] }),
			Narrowed: {
				allOf: [ref('Base'), object({ a: { type: 'string', minLength: 1 } })],
			},
		});
		expect(node('Narrowed')).toMatchObject({
			kind: 'object',
			extends: [id('Base')],
			properties: [
				{ name: 'a', required: true, schema: { kind: 'string', minLength: 1 } },
			],
		});
	});

	it('refuses a keyword next to anyOf it cannot apply, and settles `required`', async () => {
		expect(
			await errors({
				S: { anyOf: [{ type: 'string' }, { type: 'number' }], minLength: 3 },
			}),
		).toEqual([
			{
				code: 'unsupported_keyword',
				pointer: '/components/schemas/S/minLength',
			},
		]);
		const variant = (kind: string) =>
			object({ kind: { const: kind } }, { required: ['kind'] });
		const { api, node } = await components({
			S: { oneOf: [variant('a'), variant('b')], required: ['kind'] },
		});
		expect(api.warnings).toEqual([]);
		expect(node('S')).toMatchObject({
			kind: 'intersection',
			members: [{ kind: 'record' }, { kind: 'union' }],
		});
	});

	it('reads enum: [] as never, and a null value against its type', async () => {
		const { node } = await components({
			E: { enum: [] },
			S: { type: 'string', enum: ['a', null] },
		});
		expect(node('E')).toEqual({ kind: 'never' });
		expect(node('S')).toEqual({ kind: 'literal', values: ['a'] });
	});

	it('keeps null out of a list of every other type', async () => {
		const all = ['string', 'number', 'boolean', 'array', 'object'];
		expect(await nodeOf({ type: all })).toMatchObject({
			kind: 'union',
			variants: all.map(() => ({})),
		});
		expect(await nodeOf({ type: [...all, 'null'] })).toMatchObject({
			kind: 'unknown',
		});
	});

	it('warns about what it cannot check: keywords without a type, an unknown number format', async () => {
		const { api } = await components({
			A: { minItems: 2 },
			B: { unevaluatedProperties: false },
			C: { type: 'integer', format: 'uint8' },
		});
		expect(api.warnings.map((w) => [w.code, w.pointer])).toEqual([
			['not_enforced', '/components/schemas/A/minItems'],
			['not_enforced', '/components/schemas/B/unevaluatedProperties'],
			['unknown_format', '/components/schemas/C/format'],
		]);
	});
});
