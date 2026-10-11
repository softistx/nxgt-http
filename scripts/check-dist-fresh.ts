#!/usr/bin/env bun
/**
 * Fails fast when a package's `dist/` is older than its sources.
 *
 * The TypeSpec compiler loads `@nxgt/typespec` from `dist/`, so a checkout
 * pulled without a build fails dozens of specs with errors that name no
 * cause (`missing-implementation: Extern declaration must have an
 * implementation in JS file`). This check runs before those specs and says
 * what to do instead. CI builds first, so it never trips there.
 *
 *   bun scripts/check-dist-fresh.ts <package dir> [<source dir>...]
 *
 * The source directories default to `src` and `lib`. Specs (`*.spec.ts`) do
 * not count: the build does not read them.
 */
import { readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

export type Stamp = { file: string; mtimeMs: number };

/** The newest source file when it is newer than the dist entry, else undefined. */
export function staleSource(
	dist: Stamp | undefined,
	sources: readonly Stamp[],
): Stamp | undefined {
	if (!dist) return sources[0] ?? { file: '', mtimeMs: 0 };
	let newest: Stamp | undefined;
	for (const source of sources) {
		if (
			source.mtimeMs > dist.mtimeMs &&
			(!newest || source.mtimeMs > newest.mtimeMs)
		) {
			newest = source;
		}
	}
	return newest;
}

function walk(dir: string): Stamp[] {
	const found: Stamp[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) found.push(...walk(path));
		else if (!entry.name.endsWith('.spec.ts')) {
			found.push({ file: path, mtimeMs: statSync(path).mtimeMs });
		}
	}
	return found;
}

function exists(path: string): boolean {
	try {
		statSync(path);
		return true;
	} catch {
		return false;
	}
}

if (import.meta.main) {
	const [pkg = '.', ...rest] = process.argv.slice(2);
	const root = resolve(pkg);
	const dirs = rest.length > 0 ? rest : ['src', 'lib'];
	const entry = join(root, 'dist', 'index.js');
	const dist = exists(entry)
		? { file: entry, mtimeMs: statSync(entry).mtimeMs }
		: undefined;
	const sources = dirs.flatMap((dir) =>
		exists(join(root, dir)) ? walk(join(root, dir)) : [],
	);
	const stale = staleSource(dist, sources);
	if (stale) {
		const name = root.split('/').slice(-2).join('/');
		const why = dist
			? `older than ${stale.file.slice(root.length + 1)}`
			: 'missing';
		console.error(
			`${name}/dist is ${why}: the specs would load a stale library. Run \`bun run build\` first.`,
		);
		process.exit(1);
	}
}
