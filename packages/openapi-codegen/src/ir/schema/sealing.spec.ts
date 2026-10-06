import { describe, expect, it } from 'bun:test';
import { Diagnostics } from '../../errors';
import type { Location } from '../../loader/location';
import type { ObjectNode, SchemaNode } from '../types';
import { seal } from './sealing';

const at: Location = {
	file: '/spec/openapi.json',
	pointer: '/s/unevaluatedProperties',
};

const state = () => ({
	diagnostics: new Diagnostics(),
	undeclared: new WeakSet<SchemaNode>(),
});

const object = (
	additional: ObjectNode['additional'] = 'default',
): ObjectNode => ({
	kind: 'object',
	properties: [],
	additional,
	extends: [],
});

const report = (s: { diagnostics: Diagnostics }) =>
	s.diagnostics.list.map(({ severity, code, message, pointer }) => ({
		severity,
		code,
		message,
		pointer,
	}));

describe('seal', () => {
	it('does nothing for `true`', () => {
		const s = state();
		const node = object();
		seal(s, node, true, at);
		expect(node.additional).toBe('default');
		expect(s.diagnostics.list).toEqual([]);
	});

	it('refuses a schema value, at the keyword, and leaves the node as it is', () => {
		const s = state();
		const node = object();
		seal(s, node, { type: 'string' }, at);
		expect(node.additional).toBe('default');
		expect(report(s)).toEqual([
			{
				severity: 'error',
				code: 'unsupported_keyword',
				message:
					'`unevaluatedProperties` with a schema is supported only where it reads the keys `additionalProperties` would: not next to `$ref`, `allOf`, `anyOf` or `oneOf`. Write `additionalProperties` beside it instead',
				pointer: '/s/unevaluatedProperties',
			},
		]);
	});

	it('warns for a schema that declares nothing else', () => {
		const s = state();
		const node: SchemaNode = { kind: 'unknown' };
		seal(s, node, false, at);
		expect(node).toEqual({ kind: 'unknown' });
		expect(report(s)).toEqual([
			{
				severity: 'warning',
				code: 'not_enforced',
				message:
					'`unevaluatedProperties: false` on a schema that declares nothing else is not enforced: give it `type: object` and its `properties`',
				pointer: '/s/unevaluatedProperties',
			},
		]);
	});

	it('makes an object in the default mode strict, and leaves a loose or schema-valued one', () => {
		const s = state();
		const plain = object();
		const loose = object('loose');
		const valued = object({ schema: { kind: 'string' } });
		for (const node of [plain, loose, valued]) seal(s, node, false, at);
		expect(plain.additional).toBe('strict');
		expect(loose.additional).toBe('loose');
		expect(valued.additional).toEqual({ schema: { kind: 'string' } });
		expect(s.diagnostics.list).toEqual([]);
	});

	it('turns a record built from an object that declared nothing into an empty strict object', () => {
		const s = state();
		const record = {
			kind: 'record',
			values: { kind: 'unknown' },
			description: 'kept',
		} as SchemaNode;
		s.undeclared.add(record);
		seal(s, record, false, at);
		expect(record).toEqual({
			kind: 'object',
			properties: [],
			additional: 'strict',
			extends: [],
			description: 'kept',
		});
	});

	it('leaves a record the spec wrote as a record', () => {
		const record: SchemaNode = { kind: 'record', values: { kind: 'string' } };
		seal(state(), record, false, at);
		expect(record).toEqual({ kind: 'record', values: { kind: 'string' } });
	});

	it('marks a `ref` sealed, for the emitter to check its target', () => {
		const ref: SchemaNode = { kind: 'ref', target: 'x' };
		seal(state(), ref, false, at);
		expect(ref).toEqual({ kind: 'ref', target: 'x', sealed: true });
	});

	it('seals the inline members of a `oneOf`, and marks it sealed', () => {
		const a = object();
		const ref: SchemaNode = { kind: 'ref', target: 'x' };
		const union: SchemaNode = {
			kind: 'union',
			exclusive: true,
			variants: [a, ref],
		};
		const s = state();
		seal(s, union, false, at);
		expect(union).toMatchObject({ sealed: true });
		expect(a.additional).toBe('strict');
		expect(ref).toMatchObject({ sealed: true });
		expect(s.diagnostics.list).toEqual([]);
	});

	it('refuses an `anyOf`, whose variants may each contribute keys, and seals none of it', () => {
		const a = object();
		const union: SchemaNode = {
			kind: 'union',
			exclusive: false,
			variants: [a, object()],
		};
		const s = state();
		seal(s, union, false, at);
		expect(union).not.toHaveProperty('sealed');
		expect(a.additional).toBe('default');
		expect(report(s)).toEqual([
			{
				severity: 'error',
				code: 'unsupported_keyword',
				message:
					'`unevaluatedProperties: false` over `anyOf` is not supported: a value that matches several variants may use keys from each. Use `oneOf`',
				pointer: '/s/unevaluatedProperties',
			},
		]);
	});

	it('seals the members of an intersection, one level down as well', () => {
		const inner = object();
		const nested: SchemaNode = {
			kind: 'intersection',
			members: [inner],
		};
		const outer = object();
		const intersection: SchemaNode = {
			kind: 'intersection',
			members: [outer, nested],
		};
		seal(state(), intersection, false, at);
		expect(intersection).toMatchObject({ sealed: true });
		expect(nested).toMatchObject({ sealed: true });
		expect(outer.additional).toBe('strict');
		expect(inner.additional).toBe('strict');
	});

	it('leaves a node of any other kind as it is', () => {
		const node: SchemaNode = { kind: 'string' };
		const s = state();
		seal(s, node, false, at);
		expect(node).toEqual({ kind: 'string' });
		expect(s.diagnostics.list).toEqual([]);
	});
});
