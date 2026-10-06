import { describe, expect, it } from 'bun:test';
import type { SchemaNode } from '../types';
import { meet } from './meet';

const string = (extra: Partial<SchemaNode> = {}) =>
	({ kind: 'string', ...extra }) as SchemaNode;

describe('meet', () => {
	it('is the other side when one is `unknown`, which holds anything', () => {
		const s = string({ minLength: 1 });
		expect(meet({ kind: 'unknown' }, s)).toEqual(s);
		expect(meet(s, { kind: 'unknown' })).toEqual(s);
	});

	it('gives the annotations of an `unknown` to the other side, without changing it', () => {
		const s = string();
		const unknown: SchemaNode = {
			kind: 'unknown',
			description: 'd',
			default: { value: 3 },
		};
		expect(meet(s, unknown)).toEqual({
			kind: 'string',
			description: 'd',
			default: { value: 3 },
		});
		expect(s).toEqual({ kind: 'string' });
	});

	it('keeps its own annotation over the one an `unknown` brings', () => {
		expect(
			meet(string({ description: 'mine' }), {
				kind: 'unknown',
				description: 'theirs',
			}),
		).toMatchObject({ description: 'mine' });
	});

	it('is the same node when both are equal', () => {
		const a = string({ minLength: 1 });
		expect(meet(a, string({ minLength: 1 }))).toBe(a);
	});

	it('is one scalar with the constraints of both when none clash', () => {
		expect(
			meet(string({ minLength: 1 }), string({ maxLength: 5, pattern: '^a' })),
		).toEqual({ kind: 'string', minLength: 1, maxLength: 5, pattern: '^a' });
	});

	it('keeps a constraint both set to the same value', () => {
		expect(
			meet(
				string({ minLength: 1, maxLength: 5 }),
				string({ minLength: 1, pattern: 'a' }),
			),
		).toEqual({ kind: 'string', minLength: 1, maxLength: 5, pattern: 'a' });
	});

	it('is an intersection when a constraint is set to two values', () => {
		const a = string({ minLength: 1 });
		const b = string({ minLength: 2 });
		expect(meet(a, b)).toEqual({ kind: 'intersection', members: [a, b] });
	});

	it('is an intersection for scalars of different kinds, and for a kind that is not a scalar', () => {
		const a = string();
		const b: SchemaNode = { kind: 'boolean' };
		expect(meet(a, b)).toEqual({ kind: 'intersection', members: [a, b] });
		const x: SchemaNode = { kind: 'literal', values: ['a'] };
		const y: SchemaNode = { kind: 'literal', values: ['b'] };
		expect(meet(x, y).kind).toBe('intersection');
		const o1: SchemaNode = {
			kind: 'object',
			properties: [],
			additional: 'default',
			extends: [],
		};
		expect(meet(o1, { ...o1, additional: 'strict' }).kind).toBe('intersection');
	});

	it('is an integer when either side says so', () => {
		expect(
			meet(
				{ kind: 'number', integer: false, minimum: 0 },
				{ kind: 'number', integer: true },
			),
		).toEqual({ kind: 'number', integer: true, minimum: 0 });
		expect(
			meet(
				{ kind: 'number', integer: true },
				{ kind: 'number', integer: false, maximum: 9 },
			),
		).toEqual({ kind: 'number', integer: true, maximum: 9 });
	});

	it('is nullable only when both let `null` through', () => {
		expect(
			meet(
				string({ nullable: true }),
				string({ nullable: true, minLength: 1 }),
			),
		).toEqual({ kind: 'string', nullable: true, minLength: 1 });
		const one = meet(string({ nullable: true }), string({ minLength: 1 }));
		expect(one).toEqual({ kind: 'string', minLength: 1 });
		expect(one).not.toHaveProperty('nullable');
	});

	it('keeps the annotations of both, the first side’s winning', () => {
		expect(
			meet(
				string({ minLength: 1, description: 'a', deprecated: true }),
				string({
					maxLength: 2,
					description: 'b',
					readOnly: true,
					default: { value: 'x' },
				}),
			),
		).toEqual({
			kind: 'string',
			minLength: 1,
			maxLength: 2,
			description: 'a',
			deprecated: true,
			readOnly: true,
			default: { value: 'x' },
		});
	});

	it('keeps the annotations of both on an intersection, too', () => {
		const result = meet(
			string({ minLength: 1, description: 'a' }),
			string({ minLength: 2, writeOnly: true, default: { value: 'd' } }),
		);
		expect(result).toMatchObject({
			kind: 'intersection',
			description: 'a',
			writeOnly: true,
			default: { value: 'd' },
		});
	});

	it('does not change either input', () => {
		const a = string({ minLength: 1 });
		const b = string({ maxLength: 2, description: 'b' });
		meet(a, b);
		expect(a).toEqual({ kind: 'string', minLength: 1 });
		expect(b).toEqual({ kind: 'string', maxLength: 2, description: 'b' });
	});
});
