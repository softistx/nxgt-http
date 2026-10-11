import { describe, expect, test } from 'bun:test';
import { workspaceTypeScript } from './install';

describe('workspaceTypeScript', () => {
	test("pins the probe's typescript to the root devDependencies range", () => {
		expect(
			workspaceTypeScript({ devDependencies: { typescript: '~6.0.3' } }),
		).toEqual({ typescript: '~6.0.3' });
	});

	test('follows the range newest-peers.ts writes', () => {
		expect(
			workspaceTypeScript({
				devDependencies: { typescript: '^7.0.0' },
				overrides: { typescript: '^7.0.0' },
			}),
		).toEqual({ typescript: '^7.0.0' });
	});

	test('pins nothing when the root names no typescript', () => {
		expect(workspaceTypeScript({})).toEqual({});
		expect(workspaceTypeScript({ devDependencies: {} })).toEqual({});
	});
});
