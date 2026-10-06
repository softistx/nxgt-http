import { describe, expect, it } from 'bun:test';
import { Diagnostics } from '../../errors';
import type { Location } from '../../loader/location';
import type { ObjectNode, SchemaNode } from '../types';
import { objectNode } from './objects';

const at: Location = { file: '/spec/openapi.json', pointer: '/s' };

/** A `node` that answers with the pointer it was asked about. */
const state = () => ({
	diagnostics: new Diagnostics(),
	requiring: new Map<ObjectNode, Location>(),
	undeclared: new WeakSet<SchemaNode>(),
	node: (_value: unknown, where: Location): SchemaNode => ({
		kind: 'ref',
		target: where.pointer,
	}),
});

describe('objectNode', () => {
	it('builds each property at its pointer, required by `required`', () => {
		expect(
			objectNode(
				state(),
				{ properties: { a: {}, b: {} }, required: ['b'] },
				at,
			),
		).toEqual({
			kind: 'object',
			properties: [
				{
					name: 'a',
					required: false,
					schema: { kind: 'ref', target: '/s/properties/a' },
				},
				{
					name: 'b',
					required: true,
					schema: { kind: 'ref', target: '/s/properties/b' },
				},
			],
			additional: 'default',
			extends: [],
		});
	});

	it('escapes a property name in its pointer', () => {
		expect(
			objectNode(state(), { properties: { 'a/b': {} } }, at),
		).toMatchObject({
			properties: [{ schema: { target: '/s/properties/a~1b' } }],
		});
	});

	it('refuses `properties` that is not an object, at `properties`', () => {
		const s = state();
		expect(
			objectNode(s, { properties: ['a'], additionalProperties: false }, at),
		).toEqual({
			kind: 'object',
			properties: [],
			additional: 'strict',
			extends: [],
		});
		expect(s.diagnostics.list).toMatchObject([
			{
				severity: 'error',
				code: 'invalid_schema',
				message: '`properties` must be an object',
				pointer: '/s/properties',
			},
		]);
	});

	it('reads `additionalProperties` as strict, loose or a schema', () => {
		const props = { properties: { a: {} } };
		const additional = (extra: Record<string, unknown>) =>
			(objectNode(state(), { ...props, ...extra }, at) as ObjectNode)
				.additional;
		expect(additional({})).toBe('default');
		expect(additional({ additionalProperties: false })).toBe('strict');
		expect(additional({ additionalProperties: true })).toBe('loose');
		expect(additional({ additionalProperties: {} })).toBe('loose');
		expect(additional({ additionalProperties: { type: 'string' } })).toEqual({
			schema: { kind: 'ref', target: '/s/additionalProperties' },
		});
	});

	it('reads a schema-valued `unevaluatedProperties` as the extra keys when nothing else evaluates them', () => {
		expect(
			objectNode(
				state(),
				{ properties: { a: {} }, unevaluatedProperties: { type: 'string' } },
				at,
			),
		).toMatchObject({
			additional: {
				schema: { kind: 'ref', target: '/s/unevaluatedProperties' },
			},
		});
	});

	it('is a record when it declares nothing and its extra keys have a schema', () => {
		expect(
			objectNode(state(), { additionalProperties: { type: 'string' } }, at),
		).toEqual({
			kind: 'record',
			values: { kind: 'ref', target: '/s/additionalProperties' },
		});
	});

	it('is a record of anything when it declares nothing, and remembers a default one is undeclared', () => {
		const s = state();
		const bare = objectNode(s, { type: 'object' }, at);
		expect(bare).toEqual({ kind: 'record', values: { kind: 'unknown' } });
		expect(s.undeclared.has(bare)).toBe(true);

		const loose = objectNode(s, { additionalProperties: true }, at);
		expect(loose).toEqual({ kind: 'record', values: { kind: 'unknown' } });
		expect(s.undeclared.has(loose)).toBe(false);
	});

	it('stays an object when it declares nothing and refuses every key', () => {
		expect(objectNode(state(), { additionalProperties: false }, at)).toEqual({
			kind: 'object',
			properties: [],
			additional: 'strict',
			extends: [],
		});
	});

	it('warns that `minProperties` and `maxProperties` are not enforced', () => {
		const s = state();
		objectNode(
			s,
			{ properties: { a: {} }, minProperties: 1, maxProperties: 2 },
			at,
		);
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
				message: '`minProperties` is not enforced',
				pointer: '/s/minProperties',
			},
			{
				severity: 'warning',
				code: 'not_enforced',
				message: '`maxProperties` is not enforced',
				pointer: '/s/maxProperties',
			},
		]);
	});

	it('hands `checkRequires` a `required` name no property declares, at `required`', () => {
		const s = state();
		const node = objectNode(
			s,
			{ properties: { a: {} }, required: ['a', 'ghost'] },
			at,
		) as ObjectNode;
		expect(node.requires).toEqual(['ghost']);
		expect(node.properties[0]?.required).toBe(true);
		expect(s.requiring.get(node)).toEqual({ ...at, pointer: '/s/required' });
	});

	it('hands it an object that declares nothing too, rather than a record', () => {
		const s = state();
		const node = objectNode(s, { required: ['ghost'] }, at);
		expect(node).toMatchObject({
			kind: 'object',
			properties: [],
			requires: ['ghost'],
		});
		expect(s.requiring.has(node as ObjectNode)).toBe(true);
	});

	it('ignores a `required` entry that is not a string', () => {
		const s = state();
		const node = objectNode(
			s,
			{ properties: { a: {} }, required: [1, null] },
			at,
		);
		expect(node).not.toHaveProperty('requires');
		expect(s.requiring.size).toBe(0);
	});
});
