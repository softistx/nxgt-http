import { describe, expect, it } from 'bun:test';
import { Diagnostics } from '../../errors';
import { loadDocument } from '../../loader/document';
import { createMemoryFileSystem } from '../../loader/fs';
import type { Location } from '../../loader/location';
import { SchemaBuilder } from '../schemas';
import type { SchemaNode } from '../types';

const ROOT = '/spec/openapi.json';
const at: Location = { file: ROOT, pointer: '/components/schemas/S' };
const P = '/components/schemas/S';

/**
 * The dispatcher is the builder's `node`: it only makes sense with the real
 * one behind it. The document holds `value` as its `S`, since the resolver
 * follows only the `$ref`s the document has.
 */
async function run(value: unknown, legacyNullable: 'warn' | 'error' = 'warn') {
	const doc = await loadDocument(ROOT, {
		fs: createMemoryFileSystem({
			[ROOT]: JSON.stringify({
				openapi: '3.2.0',
				info: { title: 't', version: '1' },
				paths: {},
				components: {
					schemas: { Base: { type: 'object' }, S: value },
				},
			}),
		}),
	});
	const diagnostics = new Diagnostics();
	const b = new SchemaBuilder(doc.resolver, diagnostics, {
		rootDir: '/spec',
		names: {},
		legacyNullable,
	});
	const node: SchemaNode = b.node(value, at);
	return {
		node,
		problems: diagnostics.list.map(({ severity, code, message, pointer }) => ({
			severity,
			code,
			message,
			pointer,
		})),
	};
}

describe('schemaNode', () => {
	it('is `unknown` for no schema and for `true`, `never` for `false`', async () => {
		for (const [value, kind] of [
			[true, 'unknown'],
			[false, 'never'],
		] as const) {
			const { node, problems } = await run(value);
			expect(node).toEqual({ kind });
			expect(problems).toEqual([]);
		}
		// A schema that is not written at all: a property with no `items`.
		expect((await run({ type: 'array' })).node).toEqual({
			kind: 'array',
			items: { kind: 'unknown' },
		});
	});

	it('refuses a schema that is not an object or a boolean, at its location', async () => {
		for (const value of [null, 3, 'string', ['type']]) {
			const { node, problems } = await run(value);
			expect(node).toEqual({ kind: 'unknown' });
			expect(problems).toEqual([
				{
					severity: 'error',
					code: 'invalid_schema',
					message: 'a schema must be an object or a boolean',
					pointer: P,
				},
			]);
		}
	});

	it('is `unknown` for an empty schema', async () => {
		expect((await run({})).node).toEqual({ kind: 'unknown' });
	});

	describe('dispatch', () => {
		it('sends `$ref` to the reference, which meets what `type` says beside it', async () => {
			expect((await run({ $ref: '#/components/schemas/Base' })).node.kind).toBe(
				'ref',
			);
			expect(
				(await run({ $ref: '#/components/schemas/Base', type: 'string' })).node,
			).toMatchObject({
				kind: 'intersection',
				members: [{ kind: 'ref' }, { kind: 'string' }],
			});
		});

		it('sends `allOf` before `oneOf`, which then sits beside it as one more member', async () => {
			const { node } = await run({
				allOf: [{ properties: { a: { type: 'string' } } }],
				oneOf: [{ type: 'string' }, { type: 'number' }],
			});
			expect(node).toMatchObject({
				kind: 'intersection',
				members: [{ kind: 'object' }, { kind: 'union', exclusive: true }],
			});
		});

		it('sends `oneOf` and `anyOf` before `enum` and `type`', async () => {
			expect(
				(
					await run({
						oneOf: [{ type: 'string' }, { type: 'number' }],
						enum: ['a'],
					})
				).node,
			).toMatchObject({ kind: 'union', exclusive: true });
			expect(
				(await run({ anyOf: [{ type: 'string' }, { type: 'number' }] })).node,
			).toMatchObject({ kind: 'union', exclusive: false });
		});

		it('sends `enum` and `const` before `type`', async () => {
			expect((await run({ type: 'string', enum: ['a', 'b'] })).node).toEqual({
				kind: 'literal',
				values: ['a', 'b'],
			});
			expect((await run({ const: 1 })).node).toEqual({
				kind: 'literal',
				values: [1],
			});
		});

		it('falls to `type` when a composition keyword is not a list', async () => {
			expect((await run({ allOf: {}, type: 'string' })).node).toEqual({
				kind: 'string',
			});
			expect(
				(await run({ oneOf: 'x', enum: 'x', type: 'boolean' })).node,
			).toEqual({ kind: 'boolean' });
		});
	});

	it('refuses an unsupported keyword at its pointer and builds the schema all the same', async () => {
		const { node, problems } = await run({
			type: 'string',
			not: { type: 'number' },
		});
		expect(node).toEqual({ kind: 'string' });
		expect(problems).toEqual([
			{
				severity: 'error',
				code: 'unsupported_keyword',
				message: '`not` is not supported',
				pointer: `${P}/not`,
			},
		]);
	});

	it('annotates the node it built, whatever its shape', async () => {
		expect(
			(
				await run({
					type: 'string',
					description: 'd',
					readOnly: true,
					default: 'x',
				})
			).node,
		).toEqual({
			kind: 'string',
			description: 'd',
			readOnly: true,
			default: { value: 'x' },
		});
		expect((await run({ enum: ['a'], description: 'e' })).node).toMatchObject({
			kind: 'literal',
			description: 'e',
		});
	});

	it('honours the `legacyNullable` option through the annotations', async () => {
		const { node, problems } = await run(
			{ type: 'string', nullable: true },
			'error',
		);
		expect(node).toMatchObject({ nullable: true });
		expect(problems).toMatchObject([
			{ severity: 'error', code: 'legacy_nullable', pointer: `${P}/nullable` },
		]);
	});

	describe('`unevaluatedProperties`', () => {
		it('seals an object for `false`: a key nothing evaluates is refused', async () => {
			expect(
				(
					await run({
						type: 'object',
						properties: { a: { type: 'string' } },
						unevaluatedProperties: false,
					})
				).node,
			).toMatchObject({ kind: 'object', additional: 'strict' });
		});

		it('seals an `allOf` over its members and the keywords beside it alike', async () => {
			expect(
				(
					await run({
						allOf: [{ properties: { a: { type: 'string' } } }],
						unevaluatedProperties: false,
					})
				).node,
			).toMatchObject({ kind: 'object', additional: 'strict' });
		});

		it('seals every `oneOf` variant, and refuses an `anyOf`, at the keyword', async () => {
			const variants = [
				{ type: 'object', properties: { a: { type: 'string' } } },
				{ type: 'object', properties: { b: { type: 'string' } } },
			];
			const one = await run({ oneOf: variants, unevaluatedProperties: false });
			expect(one.node).toMatchObject({
				kind: 'union',
				sealed: true,
				variants: [{ additional: 'strict' }, { additional: 'strict' }],
			});
			expect(one.problems).toEqual([]);

			const any = await run({ anyOf: variants, unevaluatedProperties: false });
			expect(any.problems).toMatchObject([
				{
					code: 'unsupported_keyword',
					pointer: `${P}/unevaluatedProperties`,
				},
			]);
		});

		it('warns for a schema that declares nothing to seal', async () => {
			const { problems } = await run({ unevaluatedProperties: false });
			expect(problems).toMatchObject([
				{ code: 'not_enforced', pointer: `${P}/unevaluatedProperties` },
			]);
		});

		it('reads a schema value as `additionalProperties` when nothing else evaluates keys', async () => {
			const { node, problems } = await run({
				type: 'object',
				unevaluatedProperties: { type: 'string' },
			});
			expect(node).toEqual({ kind: 'record', values: { kind: 'string' } });
			expect(problems).toEqual([]);
		});

		it('refuses a schema value where it cannot be read that way, as beside `allOf`', async () => {
			const { problems } = await run({
				allOf: [{ $ref: '#/components/schemas/Base' }],
				unevaluatedProperties: { type: 'string' },
			});
			expect(problems).toMatchObject([
				{
					code: 'unsupported_keyword',
					pointer: `${P}/unevaluatedProperties`,
				},
			]);
		});

		it('is moot for a schema value beside `additionalProperties`', async () => {
			const { problems } = await run({
				type: 'object',
				additionalProperties: { type: 'string' },
				unevaluatedProperties: { type: 'number' },
			});
			expect(problems).toEqual([]);
		});
	});
});
