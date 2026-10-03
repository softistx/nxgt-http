import { describe, expect, test } from 'bun:test';
import { agreed, type Manifest, newest, rewrite } from './newest-peers';

test('the newest end of a range: its last alternative, or the range itself', () => {
	expect(newest('^6.0.3 || ^7.0.0')).toBe('^7.0.0');
	expect(newest('>=7.0.0 <8')).toBe('>=7.0.0 <8');
	expect(newest('^6.0.3')).toBe('^6.0.3');
	expect(newest('workspace:^')).toBeUndefined();
});

test('two carets of one major end at the same version: the narrower one', () => {
	expect(agreed('^4.0.0', '^4.13.4')).toBe('^4.13.4');
	expect(agreed('^4.13.4', '^4.0.0')).toBe('^4.13.4');
	expect(agreed('^6.0.3', '^6.0.3')).toBe('^6.0.3');
	expect(agreed('^4.0.0', '^5.0.0')).toBeUndefined();
	// Under 1.0.0 a caret holds one minor: `^0.2.0` and `^0.3.0` share nothing.
	expect(agreed('^0.2.0', '^0.3.0')).toBeUndefined();
	expect(agreed('^4.0.0', '>=4.0.0 <5')).toBeUndefined();
});

const root: Manifest = {
	devDependencies: { typescript: '~6.0.3' },
	overrides: { typescript: '~6.0.3' },
};
const pkg = (name: string, manifest: Manifest = {}): Manifest => ({
	name,
	peerDependencies: { typescript: '^6.0.3' },
	...manifest,
});

describe('rewrite', () => {
	test('a package’s own devDependency, the root’s, and every override', () => {
		const hono = pkg('@nxgt/openapi-hono', {
			peerDependencies: { hono: '^4.13.4', typescript: '^6.0.3' },
			devDependencies: { hono: '4.13.4' },
		});
		const result = rewrite(root, new Map([['h', hono]]));
		expect(result.packages.get('h')?.devDependencies).toEqual({
			hono: '^4.13.4',
		});
		expect(result.root.devDependencies).toEqual({ typescript: '^6.0.3' });
		expect(result.root.overrides).toEqual({ typescript: '^6.0.3' });
		expect(hono.devDependencies).toEqual({ hono: '4.13.4' });
	});

	test('every manifest that installs a peer gets its range: one version in the tree', () => {
		const codegen = pkg('@nxgt/openapi-codegen', {
			peerDependencies: { typescript: '^6.0.3', zod: '^4.5.4' },
			devDependencies: { zod: '4.5.4' },
		});
		// A binding installs zod for its fixtures without peering on it.
		const binding = pkg('@nxgt/openapi-httpyz', {
			peerDependencies: { '@nxgt/httpyz': 'workspace:^' },
			devDependencies: { '@nxgt/httpyz': 'workspace:^', zod: '4.5.4' },
		});
		const result = rewrite(
			root,
			new Map([
				['c', codegen],
				['b', binding],
			]),
		);
		expect(result.packages.get('b')?.devDependencies).toEqual({
			'@nxgt/httpyz': 'workspace:^',
			zod: '^4.5.4',
		});
	});

	test('two carets of one major are one range, the narrower', () => {
		const hono = pkg('@nxgt/openapi-hono', {
			peerDependencies: { hono: '^4.13.4' },
			devDependencies: { hono: '^4.13.4' },
		});
		const nuxt = pkg('@nxgt/openapi-nuxt', {
			peerDependencies: { hono: '^4.0.0' },
			devDependencies: { hono: '^4.13.4' },
		});
		const result = rewrite(
			root,
			new Map([
				['n', nuxt],
				['h', hono],
			]),
		);
		expect(result.packages.get('n')?.devDependencies).toEqual({
			hono: '^4.13.4',
		});
		expect(result.packages.get('h')?.devDependencies).toEqual({
			hono: '^4.13.4',
		});
	});

	test('a range nobody installs fails, rather than pass untested', () => {
		const lonely = pkg('@nxgt/x', {
			peerDependencies: { zod: '^4.5.4' },
		});
		expect(() => rewrite(root, new Map([['x', lonely]]))).toThrow(
			"add it to @nxgt/x's devDependencies",
		);
	});

	test('packages disagreeing on the newest fails', () => {
		const other = pkg('@nxgt/y', {
			peerDependencies: { typescript: '^6.0.3 || ^7.0.0' },
		});
		expect(() =>
			rewrite(
				root,
				new Map([
					['a', pkg('@nxgt/a')],
					['y', other],
				]),
			),
		).toThrow('disagree on the newest typescript');
	});

	test('no peer but siblings: nothing newer to test', () => {
		const binding = {
			name: '@nxgt/z',
			peerDependencies: { '@nxgt/httpyz': 'workspace:^' },
		};
		expect(() => rewrite(root, new Map([['z', binding]]))).toThrow(
			'nothing newer to test',
		);
	});
});
