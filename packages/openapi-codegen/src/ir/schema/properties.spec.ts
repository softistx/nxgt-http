import { describe, expect, it } from 'bun:test';
import type { Location } from '../../loader/location';
import type { NamedSchema, ObjectNode, Property, SchemaNode } from '../types';
import { inherited, propertyOf } from './properties';

const at: Location = { file: '/spec/openapi.json', pointer: '' };

const prop = (name: string, required = false): Property => ({
	name,
	required,
	schema: { kind: 'string', description: name },
});

const object = (names: string[] = [], extend: string[] = []): ObjectNode => ({
	kind: 'object',
	properties: names.map((name) => prop(name)),
	additional: 'default',
	extends: extend,
});

/** A lookup state whose `resolve` follows `ref`s through the named schemas. */
function lookup(schemas: Record<string, SchemaNode>) {
	const named = new Map<string, NamedSchema>(
		Object.entries(schemas).map(([id, node]) => [
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
	const resolve = (node: SchemaNode): SchemaNode => {
		let current = node;
		for (let hops = 0; current.kind === 'ref' && hops < 64; hops++) {
			const target = named.get(current.target);
			if (!target) break;
			current = target.node;
		}
		return current;
	};
	return { named, resolve };
}

describe('propertyOf', () => {
	it('finds a property the object declares', () => {
		const o = object(['a', 'b']);
		expect(propertyOf(lookup({}), o, 'b')).toBe(o.properties[1]);
	});

	it('is nothing for a name nobody declares', () => {
		expect(propertyOf(lookup({}), object(['a']), 'z')).toBeUndefined();
	});

	it('finds one through `extends`, and through the parent of a parent', () => {
		const s = lookup({
			Parent: object(['p'], ['Grand']),
			Grand: object(['g']),
		});
		const child = object([], ['Parent']);
		expect(propertyOf(s, child, 'p')?.name).toBe('p');
		expect(propertyOf(s, child, 'g')?.name).toBe('g');
	});

	it('prefers the object’s own property over a parent’s', () => {
		const s = lookup({ Parent: object(['a']) });
		const child = object(['a'], ['Parent']);
		expect(propertyOf(s, child, 'a')).toBe(child.properties[0]);
	});

	it('follows a parent that is a `ref` to another named schema', () => {
		const s = lookup({
			Alias: { kind: 'ref', target: 'Real' },
			Real: object(['r']),
		});
		expect(propertyOf(s, object([], ['Alias']), 'r')?.name).toBe('r');
	});

	it('skips a parent that is missing, or not an object', () => {
		const s = lookup({ Str: { kind: 'string' }, Good: object(['x']) });
		expect(
			propertyOf(s, object([], ['Missing', 'Str', 'Good']), 'x')?.name,
		).toBe('x');
		expect(propertyOf(s, object([], ['Missing', 'Str']), 'x')).toBeUndefined();
	});

	it('terminates on parents that extend each other', () => {
		const s = lookup({
			A: object(['a'], ['B']),
			B: object(['b'], ['A']),
		});
		expect(propertyOf(s, object([], ['A']), 'zzz')).toBeUndefined();
		expect(propertyOf(s, object([], ['A']), 'b')?.name).toBe('b');
	});
});

describe('inherited', () => {
	it('finds a property a parent declares', () => {
		const s = lookup({ Parent: object(['p']) });
		expect(inherited(s, object([], ['Parent']), 'p')?.name).toBe('p');
	});

	it('does not see the object’s own property', () => {
		const s = lookup({ Parent: object(['other']) });
		expect(inherited(s, object(['mine'], ['Parent']), 'mine')).toBeUndefined();
	});

	it('looks in the parents in order, through their own parents', () => {
		const s = lookup({
			First: object(['a'], ['Deep']),
			Second: object(['a', 'b']),
			Deep: object(['d']),
		});
		const child = object([], ['First', 'Second']);
		const found = inherited(s, child, 'a');
		expect(found?.schema).toMatchObject({ description: 'a' });
		const first = s.named.get('First')?.node;
		expect(found).toBe(
			first?.kind === 'object' ? first.properties[0] : undefined,
		);
		expect(inherited(s, child, 'd')?.name).toBe('d');
		expect(inherited(s, child, 'b')?.name).toBe('b');
	});

	it('skips a parent that is missing or not an object', () => {
		const s = lookup({ Str: { kind: 'string' } });
		expect(inherited(s, object([], ['Missing', 'Str']), 'x')).toBeUndefined();
	});
});
