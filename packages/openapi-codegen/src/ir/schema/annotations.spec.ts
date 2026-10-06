import { describe, expect, it } from 'bun:test';
import { Diagnostics } from '../../errors';
import type { Location } from '../../loader/location';
import type { SchemaNode } from '../types';
import { annotate, refuseUnsupported } from './annotations';
import { UNSUPPORTED_KEYWORDS } from './vocabulary';

const at: Location = { file: '/spec/openapi.json', pointer: '/s' };

const state = (legacyNullable: 'warn' | 'error' = 'warn') => ({
	diagnostics: new Diagnostics(),
	options: { rootDir: '/spec', names: {}, legacyNullable },
	legacyFiles: new Set<string>(),
});

const plain = (): SchemaNode => ({ kind: 'string' });

describe('annotate', () => {
	it('copies the description, and ignores one that is not a string', () => {
		expect(annotate(state(), plain(), { description: 'd' }, at)).toEqual({
			kind: 'string',
			description: 'd',
		});
		expect(annotate(state(), plain(), { description: 3 }, at)).toEqual({
			kind: 'string',
		});
	});

	it('sets `deprecated`, `readOnly` and `writeOnly` only for `true`', () => {
		expect(
			annotate(
				state(),
				plain(),
				{ deprecated: true, readOnly: true, writeOnly: true },
				at,
			),
		).toEqual({
			kind: 'string',
			deprecated: true,
			readOnly: true,
			writeOnly: true,
		});
		expect(
			annotate(
				state(),
				plain(),
				{ deprecated: false, readOnly: 'yes', writeOnly: 1 },
				at,
			),
		).toEqual({ kind: 'string' });
	});

	it('boxes the default, so that `null` and `false` are defaults and absence is none', () => {
		expect(annotate(state(), plain(), { default: null }, at)).toEqual({
			kind: 'string',
			default: { value: null },
		});
		expect(annotate(state(), plain(), { default: false }, at)).toEqual({
			kind: 'string',
			default: { value: false },
		});
		expect(annotate(state(), plain(), {}, at)).not.toHaveProperty('default');
	});

	it('returns the node it was given', () => {
		const node = plain();
		expect(annotate(state(), node, {}, at)).toBe(node);
	});

	it('does not touch `nullable: false` or a `nullable` that is not `true`', () => {
		const s = state();
		expect(annotate(s, plain(), { nullable: false }, at)).toEqual({
			kind: 'string',
		});
		expect(s.diagnostics.list).toEqual([]);
	});

	describe('`nullable: true`', () => {
		it('marks the node nullable and warns, at `nullable`, that it is OpenAPI 3.0', () => {
			const s = state();
			expect(annotate(s, plain(), { nullable: true }, at)).toEqual({
				kind: 'string',
				nullable: true,
			});
			expect(s.diagnostics.list).toMatchObject([
				{
					severity: 'warning',
					code: 'legacy_nullable',
					message:
						'uses OpenAPI 3.0 `nullable: true`, read as `type: [T, "null"]` here and everywhere else in this file',
					file: '/spec/openapi.json',
					pointer: '/s/nullable',
				},
			]);
		});

		it('warns once per file, and again for another file', () => {
			const s = state();
			annotate(s, plain(), { nullable: true }, at);
			annotate(s, plain(), { nullable: true }, { ...at, pointer: '/t' });
			annotate(
				s,
				plain(),
				{ nullable: true },
				{ file: '/spec/b.yaml', pointer: '' },
			);
			expect(s.diagnostics.list.map((d) => [d.file, d.pointer])).toEqual([
				['/spec/openapi.json', '/s/nullable'],
				['/spec/b.yaml', '/nullable'],
			]);
		});

		it('is an error each time under `legacyNullable: error`, and still marks the node', () => {
			const s = state('error');
			const a = annotate(s, plain(), { nullable: true }, at);
			annotate(s, plain(), { nullable: true }, { ...at, pointer: '/t' });
			expect(a.nullable).toBe(true);
			expect(s.diagnostics.list).toMatchObject([
				{
					severity: 'error',
					code: 'legacy_nullable',
					message: '`nullable: true` is OpenAPI 3.0; write `type: [T, "null"]`',
					pointer: '/s/nullable',
				},
				{ severity: 'error', code: 'legacy_nullable', pointer: '/t/nullable' },
			]);
			expect(s.legacyFiles.size).toBe(0);
		});
	});
});

describe('refuseUnsupported', () => {
	it('says nothing for a schema that uses none of them', () => {
		const s = state();
		refuseUnsupported(s, { type: 'string', minLength: 1 }, at);
		expect(s.diagnostics.list).toEqual([]);
	});

	it('refuses each unsupported keyword, at that keyword', () => {
		for (const keyword of UNSUPPORTED_KEYWORDS) {
			const s = state();
			refuseUnsupported(s, { [keyword]: true }, at);
			expect(s.diagnostics.list).toMatchObject([
				{
					severity: 'error',
					code: 'unsupported_keyword',
					message: `\`${keyword}\` is not supported`,
					pointer: `/s/${keyword}`,
				},
			]);
		}
	});

	it('refuses every one a schema uses, in the order the vocabulary lists them', () => {
		const s = state();
		refuseUnsupported(s, { contains: {}, not: {} }, at);
		expect(s.diagnostics.list.map((d) => d.pointer)).toEqual([
			'/s/not',
			'/s/contains',
		]);
	});
});
