import { describe, expect, test } from 'bun:test';
import { compilePath, Router } from './router';

describe('compilePath', () => {
	test('erases parameter names from the shape', () => {
		expect(compilePath('/users/:id/posts/*').shape).toBe('/users/:/posts/*');
	});

	test('refuses a path that is not absolute, or a misplaced wildcard', () => {
		expect(() => compilePath('users')).toThrow('must start with "/"');
		expect(() => compilePath('/a/*/b')).toThrow('may only end a path');
		expect(() => compilePath('/a/:id/:id')).toThrow('twice');
	});
});

describe('Router', () => {
	test('a static path wins over one with parameters', () => {
		const router = new Router<string>();
		router.add('GET', '/users/:id', 'one');
		router.add('GET', '/users/me', 'me');
		expect(router.match('GET', '/users/me')).toEqual({
			value: 'me',
			params: {},
		});
		expect(router.match('GET', '/users/7')).toEqual({
			value: 'one',
			params: { id: '7' },
		});
	});

	test('parameters are decoded', () => {
		const router = new Router<string>();
		router.add('GET', '/tags/:tag', 'tag');
		expect(router.match('GET', '/tags/a%20b')).toEqual({
			value: 'tag',
			params: { tag: 'a b' },
		});
	});

	test('refuses two paths of one shape with other names', () => {
		const router = new Router<string>();
		router.add('GET', '/users/:id', 'a');
		expect(() => router.add('POST', '/users/:userId', 'b')).toThrow(
			'same names',
		);
	});

	test('refuses a route declared twice', () => {
		const router = new Router<string>();
		router.add('GET', '/a', 'a');
		expect(() => router.add('GET', '/a', 'b')).toThrow('declared twice');
	});

	test('reports the methods a matched path allows', () => {
		const router = new Router<string>();
		router.add('GET', '/a', 'a');
		router.add('PUT', '/a', 'a');
		expect(router.match('POST', '/a')).toEqual({ allowed: ['GET', 'PUT'] });
	});
});
