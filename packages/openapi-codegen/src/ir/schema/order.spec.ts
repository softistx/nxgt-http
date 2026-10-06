import { describe, expect, it } from 'bun:test';
import type { Location } from '../../loader/location';
import type { NamedSchema, SchemaNode } from '../types';
import { emitOrder } from './order';

const at: Location = { file: '/spec/openapi.json', pointer: '' };

const ref = (target: string): SchemaNode => ({ kind: 'ref', target });

const objectOf = (...targets: string[]): SchemaNode => ({
	kind: 'object',
	properties: targets.map((t, i) => ({
		name: `p${i}`,
		required: true,
		schema: ref(t),
	})),
	additional: 'default',
	extends: [],
});

function order(nodes: Record<string, SchemaNode>) {
	const named = new Map<string, NamedSchema>(
		Object.entries(nodes).map(([id, node]) => [
			id,
			{
				id,
				name: id,
				location: at,
				source: 'component',
				node,
				recursive: false,
			},
		]),
	);
	const ordered = emitOrder(named);
	return {
		ids: ordered.map((s) => s.id),
		recursive: Object.fromEntries(ordered.map((s) => [s.id, s.recursive])),
		ordered,
		named,
	};
}

describe('emitOrder', () => {
	it('is empty for no schema', () => {
		expect(order({}).ids).toEqual([]);
	});

	it('puts a schema after every one it refers to', () => {
		const { ids } = order({
			Top: objectOf('Middle'),
			Middle: objectOf('Leaf'),
			Leaf: { kind: 'string' },
		});
		expect(ids).toEqual(['Leaf', 'Middle', 'Top']);
	});

	it('counts `extends` and every nesting of a `ref` as a dependency', () => {
		const { ids } = order({
			A: {
				kind: 'object',
				properties: [],
				additional: { schema: { kind: 'array', items: ref('C') } },
				extends: ['B'],
			},
			B: {
				kind: 'union',
				exclusive: true,
				variants: [ref('D'), { kind: 'null' }],
			},
			C: {
				kind: 'record',
				values: { kind: 'intersection', members: [ref('D')] },
			},
			D: { kind: 'string' },
		});
		expect(ids.indexOf('D')).toBeLessThan(ids.indexOf('B'));
		expect(ids.indexOf('D')).toBeLessThan(ids.indexOf('C'));
		expect(ids.indexOf('B')).toBeLessThan(ids.indexOf('A'));
		expect(ids.indexOf('C')).toBeLessThan(ids.indexOf('A'));
	});

	it('keeps every schema once, including those nothing refers to', () => {
		expect(
			order({
				A: { kind: 'string' },
				B: { kind: 'number', integer: false },
				C: { kind: 'boolean' },
			}).ids.sort(),
		).toEqual(['A', 'B', 'C']);
	});

	it('marks no schema recursive when there is no cycle', () => {
		expect(
			order({ A: objectOf('B'), B: { kind: 'string' } }).recursive,
		).toEqual({ A: false, B: false });
	});

	it('marks a schema that refers to itself recursive', () => {
		expect(
			order({ Tree: objectOf('Tree'), Leaf: { kind: 'string' } }).recursive,
		).toEqual({ Tree: true, Leaf: false });
	});

	it('marks both of two schemas that refer to each other, and not the one that merely uses them', () => {
		const { recursive, ids } = order({
			User: objectOf('Post'),
			Post: objectOf('User'),
			Feed: objectOf('Post'),
		});
		expect(recursive).toEqual({ User: true, Post: true, Feed: false });
		expect(ids.indexOf('Feed')).toBe(2);
	});

	it('clears a `recursive` mark left by an earlier run', () => {
		const named = new Map<string, NamedSchema>([
			[
				'A',
				{
					id: 'A',
					name: 'A',
					location: at,
					source: 'component',
					node: { kind: 'string' },
					recursive: true,
				},
			],
		]);
		expect(emitOrder(named)[0]?.recursive).toBe(false);
	});

	it('returns the very objects of the map', () => {
		const { ordered, named } = order({ A: { kind: 'string' } });
		expect(ordered[0]).toBe(named.get('A') as NamedSchema);
	});

	it('ignores a `ref` to a schema that is not named', () => {
		expect(order({ A: objectOf('Nowhere') }).ids).toEqual(['A']);
	});
});
