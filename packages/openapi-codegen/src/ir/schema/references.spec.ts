import { describe, expect, it } from 'bun:test';
import { CodegenError, Diagnostics } from '../../errors';
import { loadDocument } from '../../loader/document';
import { createMemoryFileSystem } from '../../loader/fs';
import type { Location } from '../../loader/location';
import { SchemaBuilder } from '../schemas';
import { reference } from './references';
import type { SchemaState } from './state';

const ROOT = '/spec/openapi.json';
const at: Location = { file: ROOT, pointer: '/components/schemas/S' };
const id = (name: string) => `${ROOT}#/components/schemas/${name}`;

/**
 * A real builder over a document whose `S` is `value`, and the node it
 * builds for it. The resolver only follows the `$ref`s the document holds,
 * so the schema under test has to be in it.
 */
async function run(value: unknown) {
	const doc = await loadDocument(ROOT, {
		fs: createMemoryFileSystem({
			[ROOT]: JSON.stringify({
				openapi: '3.2.0',
				info: { title: 't', version: '1' },
				paths: {},
				components: {
					schemas: {
						Target: { type: 'object' },
						Name: { type: 'string' },
						S: value,
					},
				},
			}),
		}),
	});
	const diagnostics = new Diagnostics();
	const b = new SchemaBuilder(doc.resolver, diagnostics, {
		rootDir: '/spec',
		names: {},
		legacyNullable: 'warn',
	});
	const node = b.node(value, at);
	return {
		b,
		node,
		problems: diagnostics.list.map(({ severity, code, message, pointer }) => ({
			severity,
			code,
			message,
			pointer,
		})),
	};
}

const target = { $ref: '#/components/schemas/Target' };

describe('reference', () => {
	it('is a `ref` node to the target’s id, and names the target as a `ref` schema', async () => {
		const { b, node } = await run(target);
		expect(node).toEqual({ kind: 'ref', target: id('Target') });
		expect(b.named.get(id('Target'))).toMatchObject({
			source: 'ref',
			name: 'Target',
		});
	});

	it('is never inlined, even when the target is a scalar', async () => {
		const { node } = await run({ $ref: '#/components/schemas/Name' });
		expect(node).toEqual({ kind: 'ref', target: id('Name') });
	});

	it('is `unknown` for a `$ref` that is not a string, which the loader refuses before', async () => {
		// Reached with no state at all: the guard returns before it reads any.
		expect(reference({} as SchemaState, { $ref: 3 }, at)).toEqual({
			kind: 'unknown',
		});
		expect(await run({ $ref: 3 }).catch((e: unknown) => e)).toBeInstanceOf(
			CodegenError,
		);
	});

	it('keeps the annotations written beside it, on the `ref` itself', async () => {
		const { node, problems } = await run({
			...target,
			description: 'd',
			deprecated: true,
			default: null,
			'x-thing': 1,
		});
		expect(node).toEqual({
			kind: 'ref',
			target: id('Target'),
			description: 'd',
			deprecated: true,
			default: { value: null },
		});
		expect(problems).toEqual([]);
	});

	it('reads `nullable: true` beside it as a nullable `ref`, with the 3.0 warning', async () => {
		const { node, problems } = await run({ ...target, nullable: true });
		expect(node).toEqual({
			kind: 'ref',
			target: id('Target'),
			nullable: true,
		});
		expect(problems).toMatchObject([
			{ code: 'legacy_nullable', pointer: '/components/schemas/S/nullable' },
		]);
	});

	it('refuses an unsupported keyword beside it, at that keyword', async () => {
		const { problems } = await run({ ...target, not: {} });
		expect(problems).toEqual([
			{
				severity: 'error',
				code: 'unsupported_keyword',
				message: '`not` is not supported',
				pointer: '/components/schemas/S/not',
			},
		]);
	});

	it('applies both, as `allOf` would, for a constraint beside it: one object extending the target', async () => {
		const { node, problems } = await run({
			...target,
			description: 'd',
			properties: { extra: { type: 'string' } },
			required: ['extra'],
		});
		expect(node).toMatchObject({
			kind: 'object',
			extends: [id('Target')],
			description: 'd',
			properties: [{ name: 'extra', required: true }],
		});
		expect(problems).toEqual([]);
	});

	it('is an intersection when what sits beside it is not an object', async () => {
		const { node } = await run({ ...target, minLength: 1 });
		expect(node).toEqual({
			kind: 'intersection',
			members: [
				{ kind: 'ref', target: id('Target') },
				{ kind: 'string', minLength: 1 },
			],
		});
	});

	describe('`unevaluatedProperties`', () => {
		it('seals the `ref` for `false`', async () => {
			const { node } = await run({ ...target, unevaluatedProperties: false });
			expect(node).toEqual({
				kind: 'ref',
				target: id('Target'),
				sealed: true,
			});
		});

		it('does nothing for `true`', async () => {
			const { node, problems } = await run({
				...target,
				unevaluatedProperties: true,
			});
			expect(node).toEqual({ kind: 'ref', target: id('Target') });
			expect(problems).toEqual([]);
		});

		it('refuses a schema, at the keyword', async () => {
			const { problems } = await run({
				...target,
				unevaluatedProperties: { type: 'string' },
			});
			expect(problems).toMatchObject([
				{
					code: 'unsupported_keyword',
					pointer: '/components/schemas/S/unevaluatedProperties',
				},
			]);
		});

		it('seals the merged object when other keywords sit beside the `$ref`', async () => {
			const { node } = await run({
				...target,
				properties: { a: { type: 'string' } },
				unevaluatedProperties: false,
			});
			expect(node).toMatchObject({
				kind: 'object',
				additional: 'strict',
				extends: [id('Target')],
			});
		});

		it('is moot beside `additionalProperties`, which already evaluates every key', async () => {
			const { node, problems } = await run({
				...target,
				additionalProperties: { type: 'string' },
				unevaluatedProperties: { type: 'number' },
			});
			// The record beside the `$ref` is an intersection member, and says nothing.
			expect(node.kind).toBe('intersection');
			expect(problems).toEqual([]);
		});
	});
});
