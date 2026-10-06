import { describe, expect, it } from 'bun:test';
import { Diagnostics } from '../../errors';
import type { Location } from '../../loader/location';
import type { ObjectNode, SchemaNode } from '../types';
import { allOfNode, combine } from './all-of';

const at: Location = { file: '/spec/openapi.json', pointer: '/s' };

const combiner = () => ({
	diagnostics: new Diagnostics(),
	requiring: new Map<ObjectNode, Location>(),
	composed: new Map<ObjectNode, Location>(),
});

const object = (
	properties: Record<string, { required?: boolean; schema?: SchemaNode }> = {},
	over: Partial<ObjectNode> = {},
): ObjectNode => ({
	kind: 'object',
	properties: Object.entries(properties).map(([name, p]) => ({
		name,
		required: p.required ?? false,
		schema: p.schema ?? { kind: 'string' },
	})),
	additional: 'default',
	extends: [],
	...over,
});

const ref = (target: string): SchemaNode => ({ kind: 'ref', target });

const report = (s: { diagnostics: Diagnostics }) =>
	s.diagnostics.list.map(({ severity, code, message, pointer }) => ({
		severity,
		code,
		message,
		pointer,
	}));

describe('combine', () => {
	it('is the member itself when there is one and nothing is required', () => {
		const only = object();
		expect(combine(combiner(), [only], [], at)).toBe(only);
	});

	it('is an intersection of members that are not all objects or refs', () => {
		const members: SchemaNode[] = [ref('A'), { kind: 'string' }];
		expect(combine(combiner(), members, [], at)).toEqual({
			kind: 'intersection',
			members,
		});
	});

	it('is an intersection when a member is a nullable object', () => {
		const nullable = object({}, { nullable: true });
		expect(combine(combiner(), [ref('A'), nullable], [], at).kind).toBe(
			'intersection',
		);
	});

	it('warns that `required` is not enforced over an intersection, at `required`', () => {
		const s = combiner();
		combine(s, [ref('A'), { kind: 'string' }], ['x'], at);
		expect(report(s)).toEqual([
			{
				severity: 'warning',
				code: 'not_enforced',
				message:
					'`required` next to an `allOf` that is not all objects is not enforced',
				pointer: '/s/required',
			},
		]);
	});

	it('is one object extending the `$ref` members', () => {
		const s = combiner();
		const node = combine(s, [ref('A'), ref('B')], [], at);
		expect(node).toEqual({
			kind: 'object',
			properties: [],
			additional: 'default',
			extends: ['A', 'B'],
		});
		expect(s.composed.get(node as ObjectNode)).toBe(at);
	});

	it('merges the inline objects’ properties, and their `extends`', () => {
		const node = combine(
			combiner(),
			[
				ref('A'),
				object({ a: {} }, { extends: ['B'] }),
				object({ b: { required: true } }),
			],
			[],
			at,
		) as ObjectNode;
		expect(node.extends).toEqual(['A', 'B']);
		expect(node.properties.map((p) => [p.name, p.required])).toEqual([
			['a', false],
			['b', true],
		]);
	});

	it('settles a property two members declare as the meet of both, required if either requires it', () => {
		const node = combine(
			combiner(),
			[
				object({
					a: { required: true, schema: { kind: 'string', minLength: 1 } },
				}),
				object({ a: { schema: { kind: 'string', maxLength: 5 } } }),
			],
			[],
			at,
		) as ObjectNode;
		expect(node.properties).toEqual([
			{
				name: 'a',
				required: true,
				schema: { kind: 'string', minLength: 1, maxLength: 5 },
			},
		]);
	});

	it('forgets that a merged member required what no property declares: the merged object settles it', () => {
		const s = combiner();
		const member = object({}, { requires: ['x'] });
		s.requiring.set(member, at);
		const node = combine(s, [member, object({ y: {} })], [], at) as ObjectNode;
		expect(s.requiring.has(member)).toBe(false);
		expect(node.requires).toEqual(['x']);
	});

	it('marks a property `required` when `required` names it, and keeps the rest as `requires`', () => {
		const node = combine(
			combiner(),
			[ref('A'), object({ a: {} })],
			['a', 'inherited', 'inherited'],
			at,
		) as ObjectNode;
		expect(node.properties[0]?.required).toBe(true);
		expect(node.requires).toEqual(['inherited']);
	});

	it('has no `requires` when everything required is declared', () => {
		const node = combine(combiner(), [ref('A'), object({ a: {} })], ['a'], at);
		expect(node).not.toHaveProperty('requires');
	});

	it('takes the last member’s `additionalProperties` that is not the default', () => {
		const node = combine(
			combiner(),
			[
				object({}, { additional: 'loose' }),
				object({}),
				object({}, { additional: { schema: { kind: 'string' } } }),
			],
			[],
			at,
		) as ObjectNode;
		expect(node.additional).toEqual({ schema: { kind: 'string' } });
		expect(
			(
				combine(
					combiner(),
					[object({}, { additional: 'loose' }), object()],
					[],
					at,
				) as ObjectNode
			).additional,
		).toBe('loose');
	});

	it('warns when a strict member sits beside others, at the `allOf`, because merged it no longer refuses their keys', () => {
		const s = combiner();
		const node = combine(
			s,
			[object({ a: {} }, { additional: 'strict' }), object({ b: {} })],
			[],
			at,
		) as ObjectNode;
		expect(node.additional).toBe('strict');
		expect(report(s)).toHaveLength(1);
		expect(report(s)[0]).toMatchObject({
			severity: 'warning',
			code: 'not_enforced',
			pointer: '/s',
		});
		expect(report(s)[0]?.message).toStartWith(
			'`additionalProperties: false` on an `allOf` member refuses, in JSON Schema, the keys the other members declare',
		);
		expect(report(s)[0]?.message).toEndWith(
			'write `unevaluatedProperties: false` next to the `allOf`',
		);
	});

	it('does not warn for a strict member alone with `required`, which nobody else contradicts', () => {
		const s = combiner();
		combine(s, [object({ a: {} }, { additional: 'strict' })], ['a'], at);
		expect(s.diagnostics.list).toEqual([]);
	});
});

describe('allOfNode', () => {
	/** `node` hands back what `members` holds for a pointer; `structure` marks what was left beside. */
	function builder(members: Record<string, SchemaNode> = {}) {
		return {
			...combiner(),
			node: (_value: unknown, where: Location): SchemaNode =>
				members[where.pointer] ?? { kind: 'unknown' },
			structure: (
				own: Record<string, unknown>,
				where: Location,
			): SchemaNode => ({
				kind: 'ref',
				target: `${where.pointer}:${Object.keys(own).join(',')}`,
			}),
		};
	}

	it('builds each member at `allOf/<index>`', () => {
		const a = object({ a: {} });
		const b = object({ b: {} });
		const node = allOfNode(
			builder({ '/s/allOf/0': a, '/s/allOf/1': b }),
			{ allOf: [{}, {}] },
			at,
		) as ObjectNode;
		expect(node.properties.map((p) => p.name)).toEqual(['a', 'b']);
	});

	it('treats the keywords beside `allOf` as one more member', () => {
		const node = allOfNode(
			builder({ '/s/allOf/0': ref('A') }),
			{ allOf: [{}], properties: { a: {} } },
			at,
		) as ObjectNode;
		expect(node.extends).toEqual(['A', '/s:properties']);
	});

	it('leaves out what is not a constraint: `type`, annotations, `x-` keys and `unevaluatedProperties`', () => {
		const only = ref('A');
		const node = allOfNode(
			builder({ '/s/allOf/0': only }),
			{
				allOf: [{}],
				type: 'object',
				description: 'd',
				nullable: true,
				'x-thing': 1,
				unevaluatedProperties: false,
			},
			at,
		);
		expect(node).toBe(only);
	});

	it('reads `required` beside `allOf` as names that live in a member', () => {
		const node = allOfNode(
			builder({ '/s/allOf/0': ref('A') }),
			{ allOf: [{}], required: ['id'] },
			at,
		) as ObjectNode;
		expect(node.extends).toEqual(['A']);
		expect(node.requires).toEqual(['id']);
	});

	it('leaves `required` to the keywords beside it when they declare `properties`', () => {
		const node = allOfNode(
			builder({ '/s/allOf/0': ref('A') }),
			{ allOf: [{}], properties: {}, required: ['id'] },
			at,
		) as ObjectNode;
		expect(node.extends).toEqual(['A', '/s:properties,required']);
		expect(node).not.toHaveProperty('requires');
	});

	it('is an intersection, warning about `required`, when a member is not an object', () => {
		const s = builder({
			'/s/allOf/0': ref('A'),
			'/s/allOf/1': { kind: 'string' },
		});
		const node = allOfNode(s, { allOf: [{}, {}], required: ['id'] }, at);
		expect(node.kind).toBe('intersection');
		expect(report(s)[0]?.pointer).toBe('/s/required');
	});
});
