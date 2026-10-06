import { describe, expect, it } from 'bun:test';
import { Diagnostics } from '../../errors';
import type { Location } from '../../loader/location';
import type { NamedSchema, ObjectNode, SchemaNode, UnionNode } from '../types';
import { checkRequires, notChecked } from './requires';

const at: Location = { file: '/spec/openapi.json', pointer: '/s/required' };

const object = (over: Partial<ObjectNode> = {}): ObjectNode => ({
	kind: 'object',
	properties: [],
	additional: 'default',
	extends: [],
	...over,
});

const named = (id: string, node: SchemaNode): NamedSchema => ({
	id,
	name: id,
	location: at,
	source: 'component',
	node,
	recursive: false,
});

/** A state whose `resolve` follows `ref`s through `named`, as the builder's does. */
function state(schemas: NamedSchema[] = []) {
	const map = new Map(schemas.map((s) => [s.id, s]));
	const resolve = (node: SchemaNode): SchemaNode => {
		let current = node;
		while (current.kind === 'ref') {
			const target = map.get(current.target);
			if (!target) break;
			current = target.node;
		}
		return current;
	};
	return {
		named: map,
		resolve,
		diagnostics: new Diagnostics(),
		requiring: new Map<ObjectNode, Location>(),
		besideUnion: new Map<ObjectNode, UnionNode>(),
	};
}

const report = (s: { diagnostics: Diagnostics }) =>
	s.diagnostics.list.map(({ severity, code, message, pointer }) => ({
		severity,
		code,
		message,
		pointer,
	}));

describe('notChecked', () => {
	it('says nothing for no name', () => {
		const s = state();
		notChecked(s, [], at);
		expect(s.diagnostics.list).toEqual([]);
	});

	it('warns once, listing every name, at the location', () => {
		const s = state();
		notChecked(s, ['a', 'b'], at);
		expect(report(s)).toEqual([
			{
				severity: 'warning',
				code: 'not_enforced',
				message:
					'`required` names `a`, `b`, which no `properties` declares: whether the key is present is not checked. Declare it under `properties`',
				pointer: '/s/required',
			},
		]);
	});
});

describe('checkRequires', () => {
	it('does nothing when no object requires an undeclared key', () => {
		const s = state();
		checkRequires(s);
		expect(s.diagnostics.list).toEqual([]);
	});

	it('warns that a key no property declares is not checked, and forgets it', () => {
		const s = state();
		const node = object({
			properties: [{ name: 'a', required: false, schema: { kind: 'string' } }],
			requires: ['ghost'],
		});
		s.requiring.set(node, at);
		checkRequires(s);
		expect(node).not.toHaveProperty('requires');
		expect(node.properties).toHaveLength(1);
		expect(report(s)).toMatchObject([
			{ severity: 'warning', code: 'not_enforced', pointer: '/s/required' },
		]);
		expect(report(s)[0]?.message).toContain('`ghost`');
	});

	it('turns an undeclared key into a required property of the `additionalProperties` schema', () => {
		const s = state();
		const node = object({
			additional: { schema: { kind: 'number', integer: true } },
			requires: ['x', 'y'],
		});
		s.requiring.set(node, at);
		checkRequires(s);
		expect(node.properties).toEqual([
			{ name: 'x', required: true, schema: { kind: 'number', integer: true } },
			{ name: 'y', required: true, schema: { kind: 'number', integer: true } },
		]);
		expect(s.diagnostics.list).toEqual([]);
	});

	it('refuses an undeclared key when no other key is allowed, at the location', () => {
		const s = state();
		const node = object({ additional: 'strict', requires: ['ghost'] });
		s.requiring.set(node, at);
		checkRequires(s);
		expect(report(s)).toEqual([
			{
				severity: 'error',
				code: 'invalid_schema',
				message:
					'`ghost` is required, yet no property declares it and no other key is allowed',
				pointer: '/s/required',
			},
		]);
		expect(node.kind).toBe('object');
	});

	it('turns an object left with nothing declared into a record of anything, keeping its annotations', () => {
		for (const additional of ['default', 'loose'] as const) {
			const s = state();
			const node = object({
				additional,
				requires: ['ghost'],
				description: 'd',
			});
			s.requiring.set(node, at);
			checkRequires(s);
			expect(node as SchemaNode).toEqual({
				kind: 'record',
				values: { kind: 'unknown' },
				description: 'd',
			});
		}
	});

	it('keeps an object that declares something', () => {
		const s = state();
		const node = object({
			properties: [{ name: 'a', required: true, schema: { kind: 'string' } }],
			requires: ['ghost'],
		});
		s.requiring.set(node, at);
		checkRequires(s);
		expect(node.kind).toBe('object');
	});

	describe('beside a union', () => {
		const variant = (name: string, required: boolean) =>
			object({
				properties: [{ name, required, schema: { kind: 'string' } }],
			});

		it('drops a name every variant requires, and says nothing of it', () => {
			const union: UnionNode = {
				kind: 'union',
				exclusive: true,
				variants: [variant('id', true), variant('id', true)],
			};
			const s = state();
			const node = object({ requires: ['id'] });
			s.requiring.set(node, at);
			s.besideUnion.set(node, union);
			checkRequires(s);
			expect(s.diagnostics.list).toEqual([]);
		});

		it('keeps, as unchecked, a name one variant leaves optional', () => {
			const union: UnionNode = {
				kind: 'union',
				exclusive: true,
				variants: [variant('id', true), variant('id', false)],
			};
			const s = state();
			const node = object({ requires: ['id'] });
			s.requiring.set(node, at);
			s.besideUnion.set(node, union);
			checkRequires(s);
			expect(report(s)).toHaveLength(1);
		});

		it('reads a variant through its `$ref`, and counts a name it requires without declaring', () => {
			const declared = named('A', variant('id', true));
			const undeclared = named('B', object({ requires: ['id'] }));
			const union: UnionNode = {
				kind: 'union',
				exclusive: true,
				variants: [
					{ kind: 'ref', target: 'A' },
					{ kind: 'ref', target: 'B' },
				],
			};
			const s = state([declared, undeclared]);
			const node = object({ requires: ['id'] });
			s.requiring.set(node, at);
			s.besideUnion.set(node, union);
			checkRequires(s);
			expect(s.diagnostics.list).toEqual([]);
		});

		it('is not satisfied by a variant that is not an object', () => {
			const union: UnionNode = {
				kind: 'union',
				exclusive: true,
				variants: [variant('id', true), { kind: 'string' }],
			};
			const s = state();
			const node = object({ requires: ['id'] });
			s.requiring.set(node, at);
			s.besideUnion.set(node, union);
			checkRequires(s);
			expect(report(s)).toHaveLength(1);
		});

		it('sees a name a variant inherits through `extends`', () => {
			const parent = named('Base', variant('id', true));
			const union: UnionNode = {
				kind: 'union',
				exclusive: true,
				variants: [object({ extends: ['Base'] }), variant('id', true)],
			};
			const s = state([parent]);
			const node = object({ requires: ['id'] });
			s.requiring.set(node, at);
			s.besideUnion.set(node, union);
			checkRequires(s);
			expect(s.diagnostics.list).toEqual([]);
		});
	});
});
