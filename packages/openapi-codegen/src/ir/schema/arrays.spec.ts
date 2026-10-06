import { describe, expect, it } from 'bun:test';
import { Diagnostics } from '../../errors';
import type { Location } from '../../loader/location';
import type { SchemaNode } from '../types';
import { arrayNode } from './arrays';

const at: Location = { file: '/spec/openapi.json', pointer: '/s' };

/** A `node` that answers with the pointer it was asked about. */
const state = () => ({
	diagnostics: new Diagnostics(),
	node: (_value: unknown, where: Location): SchemaNode => ({
		kind: 'ref',
		target: where.pointer,
	}),
});

describe('arrayNode', () => {
	it('is a list of anything when `items` is absent', () => {
		expect(arrayNode(state(), { type: 'array' }, at)).toEqual({
			kind: 'array',
			items: { kind: 'unknown' },
		});
	});

	it('builds `items` at its own pointer', () => {
		expect(arrayNode(state(), { items: {} }, at)).toEqual({
			kind: 'array',
			items: { kind: 'ref', target: '/s/items' },
		});
	});

	it('keeps the length bounds, and ignores one that is not a number', () => {
		expect(arrayNode(state(), { minItems: 1, maxItems: 3 }, at)).toMatchObject({
			minItems: 1,
			maxItems: 3,
		});
		expect(arrayNode(state(), { minItems: '1', maxItems: true }, at)).toEqual({
			kind: 'array',
			items: { kind: 'unknown' },
		});
	});

	it('refuses a tuple, at `items`, and falls back to a list of anything', () => {
		const s = state();
		expect(arrayNode(s, { items: [{}, {}] }, at)).toEqual({
			kind: 'array',
			items: { kind: 'unknown' },
		});
		expect(s.diagnostics.list).toMatchObject([
			{
				severity: 'error',
				code: 'unsupported_keyword',
				message: 'a list of `items` (a tuple) is not supported',
				pointer: '/s/items',
			},
		]);
	});

	it('warns that `uniqueItems: true` is not enforced, and says nothing for false', () => {
		const s = state();
		arrayNode(s, { uniqueItems: false }, at);
		expect(s.diagnostics.list).toEqual([]);
		arrayNode(s, { uniqueItems: true }, at);
		expect(s.diagnostics.list).toMatchObject([
			{
				severity: 'warning',
				code: 'not_enforced',
				message: '`uniqueItems` is not enforced',
				pointer: '/s/uniqueItems',
			},
		]);
	});
});
