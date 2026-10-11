import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import {
	behind,
	latestOf,
	type Manifest,
	read,
	report,
	tracked,
} from './check-nxgt-versions';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

const manifests: Manifest[] = [
	{
		dir: 'janus-mongo',
		name: '@nxgt/janus-mongo',
		devDependencies: {
			'@nxgt/janus': 'workspace:^',
			'@nxgt/mongo': '^0.18.1',
			mongodb: '^7.6.0',
		},
	},
	{
		dir: 'janus-kit',
		name: '@nxgt/janus-kit',
		devDependencies: {
			'@nxgt/janus-mongo': 'workspace:^',
			'@nxgt/mongo': '^0.18.1',
			'@nxgt/redis': '0.3.1',
		},
	},
	{ dir: 'janus', name: '@nxgt/janus', devDependencies: {} },
];

const lock = {
	'@nxgt/janus': ['@nxgt/janus@workspace:packages/janus'],
	'@nxgt/mongo': ['@nxgt/mongo@0.18.1', '', {}, 'sha512-a'],
	'@nxgt/redis': ['@nxgt/redis@0.3.1', '', {}, 'sha512-b'],
	mongodb: ['mongodb@7.6.0', '', {}, 'sha512-c'],
};

describe('tracked', () => {
	test('lists the @nxgt/* devDependencies from outside, with who names them and what is locked', () => {
		expect(tracked(manifests, lock)).toEqual([
			{
				name: '@nxgt/mongo',
				dirs: ['janus-kit', 'janus-mongo'],
				locked: ['0.18.1'],
			},
			{ name: '@nxgt/redis', dirs: ['janus-kit'], locked: ['0.3.1'] },
		]);
	});

	test('skips a sibling, even when the lock names it', () => {
		const names = tracked(manifests, lock).map((one) => one.name);
		expect(names).not.toContain('@nxgt/janus');
		expect(names).not.toContain('@nxgt/janus-mongo');
	});

	test('holds every version the lock resolves, oldest first', () => {
		const [mongo] = tracked(manifests, {
			'@nxgt/mongo': ['@nxgt/mongo@0.18.1'],
			'@nxgt/janus-kit/@nxgt/mongo': ['@nxgt/mongo@0.17.1'],
		});
		expect(mongo?.locked).toEqual(['0.17.1', '0.18.1']);
	});

	test('reads an empty lock as nothing locked', () => {
		expect(tracked(manifests, {}).map((one) => one.locked)).toEqual([[], []]);
	});
});

describe('tracked, on what is not a release', () => {
	test('skips a workspace: devDependency whose package the list does not hold', () => {
		const [mongo] = manifests;
		expect(tracked(mongo === undefined ? [] : [mongo], lock)).toEqual([
			{ name: '@nxgt/mongo', dirs: ['janus-mongo'], locked: ['0.18.1'] },
		]);
	});

	test('skips a lock entry that is not a registry version', () => {
		const [mongo] = tracked(manifests, {
			'@nxgt/mongo': ['@nxgt/mongo@0.18.1'],
			'@nxgt/janus-kit/@nxgt/mongo': ['@nxgt/mongo@github:softistx/nxgt-data'],
		});
		expect(mongo?.locked).toEqual(['0.18.1']);
	});
});

describe('behind', () => {
	const packages = tracked(manifests, lock);

	test('answers nothing when every lock is at latest', () => {
		expect(
			behind(
				packages,
				new Map([
					['@nxgt/mongo', '0.18.1'],
					['@nxgt/redis', '0.3.1'],
				]),
			),
		).toEqual([]);
	});

	test('answers a package whose lock is below latest, by semver and not by text', () => {
		expect(
			behind(
				packages,
				new Map([
					['@nxgt/mongo', '0.18.1'],
					['@nxgt/redis', '0.10.0'],
				]),
			),
		).toEqual([
			{
				name: '@nxgt/redis',
				dirs: ['janus-kit'],
				locked: '0.3.1',
				latest: '0.10.0',
			},
		]);
	});

	test('does not report a lock ahead of latest, as after a dist-tag moved back', () => {
		expect(
			behind(
				packages,
				new Map([
					['@nxgt/mongo', '0.18.0'],
					['@nxgt/redis', '0.3.1'],
				]),
			),
		).toEqual([]);
	});

	test('answers a package the lock does not hold', () => {
		expect(
			behind(
				tracked(manifests, {}),
				new Map([
					['@nxgt/mongo', '0.18.1'],
					['@nxgt/redis', '0.3.1'],
				]),
			).map((one) => one.locked),
		).toEqual([null, null]);
	});

	test('throws when latest is unknown, rather than calling it current', () => {
		expect(() =>
			behind(packages, new Map([['@nxgt/mongo', '0.18.1']])),
		).toThrow('no latest version for @nxgt/redis');
	});
});

describe('report', () => {
	test('names the package, both versions and where it is declared', () => {
		expect(
			report([
				{
					name: '@nxgt/mongo',
					dirs: ['janus-kit', 'janus-mongo'],
					locked: '0.17.1',
					latest: '0.18.1',
				},
				{
					name: '@nxgt/redis',
					dirs: ['janus-kit'],
					locked: null,
					latest: '0.3.1',
				},
			]),
		).toEqual([
			'@nxgt/mongo: 0.17.1 → 0.18.1 (packages/janus-kit, packages/janus-mongo)',
			'@nxgt/redis: not in bun.lock → 0.3.1 (packages/janus-kit)',
		]);
	});
});

describe('latestOf', () => {
	const answer = (body: unknown, status = 200) =>
		spyOn(globalThis, 'fetch').mockResolvedValue(
			new Response(JSON.stringify(body), { status }),
		);

	afterEach(() => {
		(
			globalThis.fetch as unknown as { mockRestore?: () => void }
		).mockRestore?.();
	});

	test("reads the latest dist-tag's version, at the scoped name escaped", async () => {
		const spy = answer({ version: '0.18.1' });
		expect(await latestOf('@nxgt/mongo')).toBe('0.18.1');
		expect(spy).toHaveBeenCalledWith(
			'https://registry.npmjs.org/@nxgt%2fmongo/latest',
		);
	});

	test('throws when the registry does not answer 2xx, rather than calling it current', async () => {
		answer({ error: 'Not found' }, 404);
		await expect(latestOf('@nxgt/x')).rejects.toThrow(
			'the registry answered 404 for @nxgt/x',
		);
	});

	test('throws on an answer with no version', async () => {
		answer({});
		await expect(latestOf('@nxgt/x')).rejects.toThrow(
			"no version in @nxgt/x's latest",
		);
	});
});

describe('read', () => {
	test("reads this repository's manifests and bun.lock, trailing commas included", async () => {
		const { manifests: found, lockPackages } = await read(ROOT);
		const packages = tracked(found, lockPackages);
		expect(packages.map((one) => one.name)).toContain('@nxgt/zod');
		for (const one of packages) expect(one.locked.length).toBeGreaterThan(0);
	});
});
