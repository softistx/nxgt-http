#!/usr/bin/env bun
/**
 * Rewrites the workspace to build against the newest version of each peer
 * the packages accept. For a peer range with alternatives, such as
 * `typescript: ^6.0.3 || ^7.0.0`, that is the last one — alternatives are
 * written oldest first. For a single range, such as `hono: ^4.13.4`, it is
 * the range itself, which an install without a lockfile resolves to the
 * newest version it allows. A sibling's `workspace:^` is the sibling.
 *
 * The repository's own toolchain is the lockfile's: whatever each package's
 * devDependency range resolved to at the last install, which grows older
 * with the lockfile. CI's "Newest peers" job runs this, deletes `bun.lock`,
 * installs, then builds, typechecks, tests and verifies the artifacts: the
 * newest end of each peer range, as of today. The lower bounds of the peer
 * ranges are tested by neither. The ranges come from the
 * packages' own manifests, so widening one is all it takes for this to test
 * it — and a range it could not test fails the run, rather than pass it.
 *
 * Every manifest that installs a rewritten peer gets the same range: the
 * packages' `devDependencies` and `dependencies`, and the root's
 * `devDependencies` and `overrides`. One range everywhere is one version in
 * the tree — two zods would be two schemas no `instanceof` survives, and two
 * Honos two `Context`s. Two packages' ranges that differ but end at the same
 * version, carets of one major such as `^4.0.0` and `^4.13.4`, get the
 * narrower one, which both accept.
 *
 * It edits those manifests in place: run it on a throwaway checkout, never
 * commit what it writes.
 *
 *   bun scripts/newest-peers.ts
 */
import { join } from 'node:path';
import { ROOT } from './artifacts/packages';

export type Manifest = Record<string, unknown> & {
	name?: string;
	peerDependencies?: Record<string, string>;
	dependencies?: Record<string, string>;
	devDependencies?: Record<string, string>;
	overrides?: Record<string, string>;
};

/**
 * The newest end of a range: its last alternative, the range itself when it
 * has one, and `undefined` for a sibling's `workspace:` range.
 */
export function newest(range: string): string | undefined {
	if (range.startsWith('workspace:')) return undefined;
	return range
		.split('||')
		.map((part) => part.trim())
		.at(-1);
}

/** `^4.13.4`: a caret range on one version, its major captured. */
const CARET = /^\^(\d+)\.\d+\.\d+$/;

/**
 * The one range two newest ends come to, or `undefined` when they differ.
 * Two carets of one major above 0, `^4.0.0` and `^4.13.4`, both resolve to
 * the latest 4.x without a lockfile: the narrower one, which both accept.
 */
export function agreed(a: string, b: string): string | undefined {
	if (a === b) return a;
	const left = CARET.exec(a);
	const right = CARET.exec(b);
	if (!left || !right || left[1] !== right[1] || left[1] === '0') {
		return undefined;
	}
	return Bun.semver.order(a.slice(1), b.slice(1)) >= 0 ? a : b;
}

export interface Rewrite {
	readonly root: Manifest;
	readonly packages: ReadonlyMap<string, Manifest>;
	/** One line per range set: `<where> <name>@<range>`. */
	readonly pinned: readonly string[];
}

/** The fields of a workspace manifest that install something. */
const INSTALLED = ['dependencies', 'devDependencies'] as const;

/**
 * The manifests with every peer pinned to its newest wherever one installs
 * it: a package's `dependencies` and `devDependencies`, the root's
 * `devDependencies` and its `overrides`. Pure: the caller writes the
 * result, or nothing when this throws.
 */
export function rewrite(
	root: Manifest,
	packages: ReadonlyMap<string, Manifest>,
): Rewrite {
	const atRoot = new Map<string, string>();
	for (const manifest of packages.values()) {
		for (const [name, range] of Object.entries(
			manifest.peerDependencies ?? {},
		)) {
			const version = newest(range);
			if (version === undefined) continue;
			if (
				manifest.devDependencies?.[name] === undefined &&
				root.devDependencies?.[name] === undefined
			) {
				throw new Error(
					`${manifest.name} accepts ${name} ${range}, but neither it nor the root installs ${name}: add it to ${manifest.name}'s devDependencies.`,
				);
			}
			const seen = atRoot.get(name);
			const both = seen === undefined ? version : agreed(seen, version);
			if (both === undefined) {
				throw new Error(
					`The packages disagree on the newest ${name}: ${seen} and ${version}. Align their peer ranges.`,
				);
			}
			atRoot.set(name, both);
		}
	}
	if (atRoot.size === 0) {
		throw new Error('No package has a peer range: nothing newer to test.');
	}

	const pinned: string[] = [];
	const pin = (manifests: ReadonlyMap<string, Manifest>) => {
		const next = new Map<string, Manifest>();
		for (const [path, manifest] of manifests) {
			const copy: Manifest = structuredClone(manifest);
			for (const field of INSTALLED) {
				const deps = copy[field];
				if (deps === undefined) continue;
				for (const [name, version] of atRoot) {
					if (deps[name] === undefined || deps[name] === version) continue;
					deps[name] = version;
					pinned.push(`${String(copy.name).padEnd(28)} ${name}@${version}`);
				}
			}
			next.set(path, copy);
		}
		return next;
	};
	const nextPackages = pin(packages);

	const nextRoot: Manifest = structuredClone(root);
	for (const [name, version] of atRoot) {
		const where: string[] = [];
		if (nextRoot.devDependencies?.[name] !== undefined) {
			nextRoot.devDependencies[name] = version;
			where.push('devDependencies');
		}
		if (nextRoot.overrides?.[name] !== undefined) {
			nextRoot.overrides[name] = version;
			where.push('overrides');
		}
		if (where.length > 0) {
			pinned.push(
				`${`(root ${where.join(', ')})`.padEnd(28)} ${name}@${version}`,
			);
		}
	}
	return {
		root: nextRoot,
		packages: nextPackages,
		pinned,
	};
}

async function write(path: string, manifest: Manifest): Promise<void> {
	await Bun.write(path, `${JSON.stringify(manifest, null, '\t')}\n`);
}

async function manifestsIn(glob: string): Promise<Map<string, Manifest>> {
	const found = new Map<string, Manifest>();
	for (const file of new Bun.Glob(glob).scanSync(ROOT)) {
		const path = join(ROOT, file);
		found.set(path, (await Bun.file(path).json()) as Manifest);
	}
	return found;
}

if (import.meta.main) {
	const rootPath = join(ROOT, 'package.json');
	let result: Rewrite;
	try {
		result = rewrite(
			(await Bun.file(rootPath).json()) as Manifest,
			await manifestsIn('packages/*/package.json'),
		);
	} catch (error) {
		console.error((error as Error).message);
		process.exit(1);
	}
	await write(rootPath, result.root);
	for (const [path, manifest] of result.packages) await write(path, manifest);
	for (const line of result.pinned) console.log(`  pinned   ${line}`);
}
