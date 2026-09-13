/** What the generated validators do at runtime, against the golden files. */
import { describe, expect, it } from 'bun:test';
import * as K from '../../test/generated/kitchen-sink/zod.gen';
import * as S from '../../test/generated/split/zod.gen';

const ok = (
	schema: { safeParse(v: unknown): { success: boolean } },
	value: unknown,
) => schema.safeParse(value).success;

describe('generated validators', () => {
	it('fills in defaults, a fresh object each time', () => {
		const first = K.zDefaults.parse({});
		expect(first).toEqual({
			page: 1,
			sort: 'asc',
			filter: {},
			tags: [],
			note: null,
		});
		expect(first.filter).not.toBe(K.zDefaults.parse({}).filter);
		expect(K.zUsesDefaults.parse({ defaults: {} }).defaults?.page).toBe(1);
	});

	it('strips unknown keys unless the spec says otherwise', () => {
		expect(K.zTimestamps.parse({ extra: 1 })).toEqual({});
		expect(K.zLoose.parse({ a: 'x', extra: 1 })).toEqual({ a: 'x', extra: 1 });
		expect(ok(K.zStrict, { a: 'x', extra: 1 })).toBe(false);
		expect(ok(K.zCatchall, { a: 1, extra: 2 })).toBe(true);
		expect(ok(K.zCatchall, { a: 1, extra: 'no' })).toBe(false);
	});

	it('extends every parent, restating its own unknown-key mode', () => {
		expect(K.zNamed.parse({ a: 'x', name: 'n', extra: 1 })).toEqual({
			a: 'x',
			name: 'n',
		});
		expect(ok(K.zNamed, { name: 'n' })).toBe(false);
	});

	it('picks a variant by its discriminator', () => {
		expect(ok(K.zPet, { kind: 'cat', lives: 9 })).toBe(true);
		expect(ok(K.zPet, { kind: 'cat' })).toBe(false);
		expect(ok(K.zPet, { kind: 'bird' })).toBe(false);
		expect(ok(K.zMaybePet, { pet: null })).toBe(true);
		expect(K.zOwned.parse({ kind: 'dog', owner: 'me', extra: 1 })).toEqual({
			kind: 'dog',
			owner: 'me',
		});
	});

	it('validates recursive schemas all the way down', () => {
		expect(
			ok(K.zTree, { value: 'a', children: [{ value: 'b', children: [] }] }),
		).toBe(true);
		expect(ok(K.zTree, { value: 'a', children: [{ children: [] }] })).toBe(
			false,
		);
		expect(ok(K.zNested, [[[]], []])).toBe(true);
		expect(ok(K.zNested, [[1]])).toBe(false);
		expect(ok(K.zPing, { pong: { n: 1, ping: { pong: { n: 2 } } } })).toBe(
			true,
		);
		expect(ok(K.zPing, { pong: { n: 1, ping: { pong: {} } } })).toBe(false);
		const employee = {
			name: 'Ada',
			email: 'ada@example.com',
			id: '3f1c2a4e-8b7d-4c1e-1a2b-1c2d3e4f5a6b',
			createdAt: '2024-01-01T00:00:00Z',
		};
		expect(
			ok(S.zEmployee, { ...employee, manager: { ...employee, manager: null } }),
		).toBe(true);
		expect(ok(S.zEmployee, { ...employee, manager: { name: 'x' } })).toBe(
			false,
		);
	});

	it('checks formats and patterns', () => {
		const when = '2024-01-01T00:00:00+02:00';
		expect(ok(K.zFormats, { when })).toBe(true);
		expect(ok(K.zFormats, { when: '2024-01-01T00:00:00' })).toBe(false);
		expect(ok(K.zFormats, { when, code: 'abc/12' })).toBe(true);
		expect(ok(K.zFormats, { when, code: 'abc-12' })).toBe(false);
		expect(ok(K.zFormats, { when, slug: 'a/b-c' })).toBe(true);
		expect(ok(K.zNumbers, { ratio: 0 })).toBe(false);
		expect(ok(K.zNumbers, { count: 2 ** 31 })).toBe(false);
		expect(ok(K.zLiterals, { mixed: true, maybe: null })).toBe(true);
		expect(ok(K.zLiterals, { mixed: false })).toBe(false);
	});

	it('keeps keys that are not identifiers', () => {
		expect(K.zKeys.parse({ 'x-trace-id': 't', default: 'd' })).toEqual({
			'x-trace-id': 't',
			default: 'd',
		});
	});
});
