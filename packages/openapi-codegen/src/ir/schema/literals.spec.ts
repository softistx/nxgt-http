import { describe, expect, it } from 'bun:test';
import { Diagnostics } from '../../errors';
import type { Location } from '../../loader/location';
import { enumOrConst } from './literals';

const at: Location = { file: '/spec/openapi.json', pointer: '/s' };

const run = (s: Record<string, unknown>) => {
	const diagnostics = new Diagnostics();
	const node = enumOrConst({ diagnostics }, s, at);
	return {
		node,
		problems: diagnostics.list.map(({ severity, code, message, pointer }) => ({
			severity,
			code,
			message,
			pointer,
		})),
	};
};

describe('enumOrConst', () => {
	it('is nothing for a schema with neither `const` nor an `enum` list', () => {
		expect(run({ type: 'string' }).node).toBeUndefined();
		expect(run({ enum: 'a' }).node).toBeUndefined();
	});

	it('reads `const` as a literal of one value', () => {
		expect(run({ const: 'a' }).node).toEqual({
			kind: 'literal',
			values: ['a'],
		});
		expect(run({ const: 0 }).node).toEqual({ kind: 'literal', values: [0] });
		expect(run({ const: false }).node).toEqual({
			kind: 'literal',
			values: [false],
		});
	});

	it('reads `const: null` as `null`', () => {
		expect(run({ const: null }).node).toEqual({ kind: 'null' });
	});

	it('keeps every value of an `enum`, in order, of mixed scalar types', () => {
		expect(run({ enum: ['b', 1, true, 'a'] }).node).toEqual({
			kind: 'literal',
			values: ['b', 1, true, 'a'],
		});
	});

	it('moves `null` out of the values and into `nullable`', () => {
		expect(run({ enum: ['a', null] }).node).toEqual({
			kind: 'literal',
			values: ['a'],
			nullable: true,
		});
	});

	it('is `never` for an empty `enum`, `null` for one holding only `null`', () => {
		expect(run({ enum: [] }).node).toEqual({ kind: 'never' });
		expect(run({ enum: [null] }).node).toEqual({ kind: 'null' });
	});

	it('refuses a value that is an object or a list, once each, at the keyword', () => {
		const { node, problems } = run({ enum: ['a', { x: 1 }, []] });
		expect(node).toEqual({ kind: 'literal', values: ['a'] });
		expect(problems).toHaveLength(2);
		expect(problems[0]).toEqual({
			severity: 'error',
			code: 'invalid_schema',
			message:
				'an `enum` or `const` value must be a string, number, boolean or null',
			pointer: '/s/enum',
		});
	});

	it('refuses an object `const` at `const`, and is `never`', () => {
		const { node, problems } = run({ const: {} });
		expect(node).toEqual({ kind: 'never' });
		expect(problems.map((p) => p.pointer)).toEqual(['/s/const']);
	});

	describe('names', () => {
		it('takes `x-enum-varnames`, one per value', () => {
			expect(
				run({ enum: ['a', 'b'], 'x-enum-varnames': ['Alpha', 'Beta'] }).node,
			).toEqual({
				kind: 'literal',
				values: ['a', 'b'],
				names: ['Alpha', 'Beta'],
			});
		});

		it('takes `x-enumNames` when there is no `x-enum-varnames`, and prefers the latter', () => {
			expect(run({ enum: ['a'], 'x-enumNames': ['Alpha'] }).node).toMatchObject(
				{ names: ['Alpha'] },
			);
			expect(
				run({
					enum: ['a'],
					'x-enumNames': ['Other'],
					'x-enum-varnames': ['Alpha'],
				}).node,
			).toMatchObject({ names: ['Alpha'] });
		});

		it('drops the name that stands for `null`', () => {
			expect(
				run({
					enum: ['a', null, 'b'],
					'x-enum-varnames': ['A', 'None', 'B'],
				}).node,
			).toEqual({
				kind: 'literal',
				values: ['a', 'b'],
				nullable: true,
				names: ['A', 'B'],
			});
		});

		it('refuses names of the wrong number, not identifiers or repeated, at the keyword, and drops them all', () => {
			for (const names of [
				['A'],
				['A', 'not valid'],
				['A', 'A'],
				['A', 1],
				'AB',
			]) {
				const { node, problems } = run({
					enum: ['a', 'b'],
					'x-enum-varnames': names,
				});
				expect(node).toEqual({ kind: 'literal', values: ['a', 'b'] });
				expect(problems).toEqual([
					{
						severity: 'error',
						code: 'invalid_schema',
						message:
							'x-enum-varnames must list one distinct identifier per enum value',
						pointer: '/s/x-enum-varnames',
					},
				]);
			}
		});

		it('names the keyword that was written in the message', () => {
			expect(
				run({ enum: ['a'], 'x-enumNames': [] }).problems.map((p) => [
					p.message,
					p.pointer,
				]),
			).toEqual([
				[
					'x-enumNames must list one distinct identifier per enum value',
					'/s/x-enumNames',
				],
			]);
		});

		it('gives a `const` no names', () => {
			expect(run({ const: 'a', 'x-enum-varnames': ['A'] }).node).toEqual({
				kind: 'literal',
				values: ['a'],
			});
		});
	});

	describe('beside a `type`', () => {
		it('removes the `null` of an `enum` that `type: string` does not admit', () => {
			expect(run({ type: 'string', enum: ['a', null] }).node).toEqual({
				kind: 'literal',
				values: ['a'],
			});
		});

		it('keeps it when the `type` list holds `null`', () => {
			expect(run({ type: ['string', 'null'], enum: ['a', null] }).node).toEqual(
				{
					kind: 'literal',
					values: ['a'],
					nullable: true,
				},
			);
		});

		it('is `never` for an `enum` of `null` alone under a type that is not `null`', () => {
			expect(run({ type: 'string', enum: [null] }).node).toEqual({
				kind: 'never',
			});
			expect(run({ type: 'null', enum: [null] }).node).toEqual({
				kind: 'null',
			});
		});

		it('reports a type that is no JSON Schema type, at `type`', () => {
			const { problems } = run({ type: 'date', const: 'a' });
			expect(problems.map((p) => p.pointer)).toEqual(['/s/type']);
		});
	});
});
