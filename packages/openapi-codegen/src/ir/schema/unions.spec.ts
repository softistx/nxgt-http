import { describe, expect, it } from 'bun:test';
import { Diagnostics } from '../../errors';
import type { Location } from '../../loader/location';
import type { ObjectNode, SchemaNode, UnionNode } from '../types';
import { unionNode } from './unions';

const at: Location = { file: '/spec/openapi.json', pointer: '/s' };

/** `node` answers with `variants` by pointer, a string by default. */
function state(variants: Record<string, SchemaNode> = {}) {
	return {
		diagnostics: new Diagnostics(),
		besideUnion: new Map<ObjectNode, UnionNode>(),
		discriminators: new Map<UnionNode, Location>(),
		node: (_value: unknown, where: Location): SchemaNode =>
			variants[where.pointer] ?? { kind: 'string' },
		structure: (own: Record<string, unknown>): SchemaNode =>
			own['properties']
				? {
						kind: 'object',
						properties: [],
						additional: 'default',
						extends: [],
					}
				: { kind: 'unknown' },
	};
}

const report = (s: { diagnostics: Diagnostics }) =>
	s.diagnostics.list.map(({ severity, code, message, pointer }) => ({
		severity,
		code,
		message,
		pointer,
	}));

const num: SchemaNode = { kind: 'number', integer: false };
const nul: SchemaNode = { kind: 'null' };

describe('unionNode', () => {
	it('is an exclusive union for `oneOf`, a non-exclusive one for `anyOf`', () => {
		const variants = { '/s/oneOf/1': num, '/s/anyOf/1': num };
		expect(unionNode(state(variants), { oneOf: [{}, {}] }, at)).toEqual({
			kind: 'union',
			exclusive: true,
			variants: [{ kind: 'string' }, num],
		});
		expect(unionNode(state(variants), { anyOf: [{}, {}] }, at)).toMatchObject({
			kind: 'union',
			exclusive: false,
		});
	});

	it('builds each variant at `<keyword>/<index>`', () => {
		const node = unionNode(
			state({ '/s/oneOf/2': num }),
			{ oneOf: [{}, {}, {}] },
			at,
		) as UnionNode;
		expect(node.variants[2]).toEqual(num);
	});

	it('refuses `oneOf` beside `anyOf`, at `anyOf`, and uses `oneOf`', () => {
		const s = state();
		const node = unionNode(s, { oneOf: [{}, {}], anyOf: [{}] }, at);
		expect(node).toMatchObject({ exclusive: true });
		expect(report(s)).toEqual([
			{
				severity: 'error',
				code: 'unsupported_keyword',
				message: '`oneOf` and `anyOf` together are not supported',
				pointer: '/s/anyOf',
			},
		]);
	});

	it('moves a `null` variant into `nullable`', () => {
		expect(
			unionNode(state({ '/s/oneOf/1': nul }), { oneOf: [{}, {}, {}] }, at),
		).toMatchObject({
			kind: 'union',
			nullable: true,
			variants: [{ kind: 'string' }, { kind: 'string' }],
		});
	});

	it('is the variant itself, nullable, when one is left beside `null`', () => {
		expect(
			unionNode(state({ '/s/oneOf/1': nul }), { oneOf: [{}, {}] }, at),
		).toEqual({ kind: 'string', nullable: true });
	});

	it('is a lone variant as it is, with no union around it', () => {
		expect(unionNode(state(), { anyOf: [{}] }, at)).toEqual({ kind: 'string' });
	});

	it('is `null` when every variant is, and for an empty list', () => {
		expect(
			unionNode(
				state({ '/s/oneOf/0': nul, '/s/oneOf/1': nul }),
				{ oneOf: [{}, {}] },
				at,
			),
		).toEqual({ kind: 'null' });
		expect(unionNode(state(), { oneOf: [] }, at)).toEqual({ kind: 'null' });
	});

	describe('discriminator', () => {
		it('is recorded, at `discriminator`, for `checkDiscriminators`', () => {
			const s = state();
			const node = unionNode(
				s,
				{
					oneOf: [{}, {}],
					discriminator: { propertyName: 'kind', mapping: { a: 'A' } },
				},
				at,
			) as UnionNode;
			expect(node.discriminator).toBe('kind');
			expect(s.discriminators.get(node)).toEqual({
				...at,
				pointer: '/s/discriminator',
			});
			expect(s.diagnostics.list).toEqual([]);
		});

		it('is ignored without a string `propertyName`', () => {
			for (const discriminator of [{}, { propertyName: 3 }, 'kind', null]) {
				const s = state();
				const node = unionNode(s, { oneOf: [{}, {}], discriminator }, at);
				expect(node).not.toHaveProperty('discriminator');
				expect(s.discriminators.size).toBe(0);
			}
		});

		it('is ignored for a union that is one variant', () => {
			const s = state();
			unionNode(
				s,
				{ oneOf: [{}], discriminator: { propertyName: 'kind' } },
				at,
			);
			expect(s.discriminators.size).toBe(0);
		});
	});

	describe('keywords beside the variants', () => {
		it('lets annotations, `x-` keys, `type`, the discriminator and refused keywords sit there without a word', () => {
			const s = state();
			unionNode(
				s,
				{
					oneOf: [{}, {}],
					type: 'object',
					description: 'd',
					nullable: true,
					'x-a': 1,
					unevaluatedProperties: false,
					not: {},
					if: {},
				},
				at,
			);
			expect(s.diagnostics.list).toEqual([]);
		});

		it('refuses any other, at its keyword, naming the union keyword', () => {
			const s = state();
			unionNode(s, { anyOf: [{}, {}], minLength: 1, format: 'email' }, at);
			expect(report(s)).toEqual([
				{
					severity: 'error',
					code: 'unsupported_keyword',
					message:
						'`minLength` next to `anyOf` is not supported: write it in each variant',
					pointer: '/s/minLength',
				},
				{
					severity: 'error',
					code: 'unsupported_keyword',
					message:
						'`format` next to `anyOf` is not supported: write it in each variant',
					pointer: '/s/format',
				},
			]);
		});

		it('applies `properties`, `required`, `items` and the like on top: an intersection of that shape and the union', () => {
			const s = state();
			const node = unionNode(s, { oneOf: [{}, {}], properties: { a: {} } }, at);
			expect(node).toMatchObject({
				kind: 'intersection',
				members: [{ kind: 'object' }, { kind: 'union', exclusive: true }],
			});
			expect(s.diagnostics.list).toEqual([]);
		});

		it('remembers an object beside a union, for `checkRequires`', () => {
			const s = state();
			const node = unionNode(
				s,
				{ oneOf: [{}, {}], properties: {}, required: ['id'] },
				at,
			);
			if (node.kind !== 'intersection')
				throw new Error('expected an intersection');
			const [object, union] = node.members;
			expect(s.besideUnion.get(object as ObjectNode)).toBe(union as UnionNode);
		});

		it('does not remember it when what the variants left is no union', () => {
			const s = state();
			const node = unionNode(s, { oneOf: [{}], properties: {} }, at);
			expect(node.kind).toBe('intersection');
			expect(s.besideUnion.size).toBe(0);
		});

		it('does not remember a shape that is not an object', () => {
			const s = state();
			unionNode(s, { oneOf: [{}, {}], items: {} }, at);
			expect(s.besideUnion.size).toBe(0);
		});
	});
});
