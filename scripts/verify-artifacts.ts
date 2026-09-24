#!/usr/bin/env bun

/**
 * Packs every package, installs the tarballs the way a consumer does, and
 * imports every subpath each one declares.
 *
 * This exists because `bun run build` exiting 0 proves almost nothing here.
 * The specs import each sibling's source, so nothing they run loads `dist/`.
 * In nxgt-core, where this script comes from, three defects shipped past a
 * green build, each throwing the instant its package was imported, and all
 * three invisible to `bun run build`, `bun typecheck` and `biome`.
 * Only importing the built artifact catches that class of failure. A bin is
 * the same story, so each one declared is run from `node_modules/.bin` with
 * `--help`: that proves the link, the `#!` line and the mode together.
 *
 * The install uses `overrides` so the packages resolve to each other's
 * tarballs rather than to whatever is on the registry — otherwise this would
 * silently verify the *published* versions instead of the working tree.
 * Everything else resolves from the registry the way a consumer's install
 * does. Optional peers are installed too, the way a
 * consumer who uses the subpath that needs one would.
 */

import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

type Pkg = { name: string; dir: string; subpaths: string[]; bins: string[] };

/** Every subpath a package publishes, from its own `exports` map. */
function subpathsOf(name: string, exports: Record<string, unknown>): string[] {
	return Object.keys(exports)
		.filter((key) => key.startsWith('.') && !key.endsWith('package.json'))
		.map((key) => (key === '.' ? name : `${name}/${key.slice(2)}`));
}

async function readPackages(): Promise<Pkg[]> {
	const dirs = [...new Bun.Glob('packages/*/package.json').scanSync(ROOT)];
	const pkgs: Pkg[] = [];
	for (const rel of dirs.sort()) {
		const manifest = await Bun.file(join(ROOT, rel)).json();
		pkgs.push({
			name: manifest.name,
			dir: join(ROOT, rel.replace(/\/package\.json$/, '')),
			subpaths: subpathsOf(manifest.name, manifest.exports ?? {}),
			bins:
				typeof manifest.bin === 'string'
					? [manifest.name.split('/').pop()]
					: Object.keys(manifest.bin ?? {}),
		});
	}
	return pkgs;
}

/**
 * What a published manifest may not contain, measured on Bun 1.4.0 rather than
 * assumed:
 *
 *   - a `link:` or `file:` in a field a consumer installs. `devDependencies`
 *     are exempt: a consumer never installs a dependency's dev dependencies,
 *     so a `link:` there is untidy, not harmful.
 *   - a **required** peer that is on no registry. This is the shape that once
 *     broke every consumer's install of nxgt-core with a 404. An *optional*
 *     peer is safe whatever its range; a required one is not.
 *   - an **exact pin on a sibling package**. `workspace:*` publishes as the
 *     exact version, so `@nxgt/openapi-httpyz` would demand the exact
 *     `@nxgt/httpyz` it was built with while the consumer's own caret range
 *     resolved to a newer one: two copies in one tree, and two
 *     `ValidationError` classes. `workspace:^` publishes
 *     as a caret range, which dedupes.
 *   - a **sibling range that excludes the sibling being published beside it**.
 *     `workspace:^` is substituted from `bun.lock`, not from the sibling's
 *     `package.json`, so a `changeset version` that is not followed by a
 *     `bun install` publishes yesterday's numbers. This repository was carrying
 *     that exact staleness on 2026-09-22: PR #46 released
 *     `@nxgt/openapi-nuxt@0.3.0` and left `bun.lock` saying `0.2.1`. Nothing
 *     shipped wrong only because no sibling depends on `openapi-nuxt`. In
 *     `nxgt-core` the same shape put `@nxgt/shared-graphql@2.0.0` on npm asking
 *     for `@nxgt/security@^3.2.1` while its `dist` imported the 4.0.0 API: the
 *     install succeeds, the types check, and the consumer quietly gets both
 *     majors. Every range involved is a well-formed caret, which is why nothing
 *     else notices.
 *   - a **package that lists itself** in a field a consumer installs. Neither
 *     of the checks above sees it: `@nxgt/material` shipped
 *     `"@nxgt/material": "."` for four months, and `.` is neither a `file:`
 *     prefix nor a digit. It is not inert — `.` resolves to the *consumer's*
 *     directory, so every install grew a second copy of the package reporting
 *     the consumer's own version, plus a `bun.lock` entry no manifest declared
 *     and `bun install` kept re-creating. A package self-references through its
 *     `name` and `exports`; it never needs to depend on itself.
 *   - a **license other than MIT, or no `LICENSE` in the tarball**. npm only
 *     ships the `LICENSE` in the package's own directory, never the root's.
 */
async function manifestProblems(tarballs: string[]): Promise<string[]> {
	const problems: string[] = [];
	/** Sibling name to the version being published in this same run. */
	const own = new Map<string, string>();
	const manifests: Record<string, unknown>[] = [];

	for (const tgz of tarballs) {
		const raw = await $`tar -xzOf ${tgz} package/package.json`.quiet().text();
		const manifest = JSON.parse(raw);
		manifests.push(manifest);
		own.set(manifest.name, manifest.version);
		if (manifest.license !== 'MIT') {
			problems.push(
				`${manifest.name}: license is ${manifest.license}, not MIT`,
			);
		}
		const entries = (await $`tar -tzf ${tgz}`.quiet().text()).split('\n');
		if (!entries.includes('package/LICENSE')) {
			problems.push(`${manifest.name}: the tarball has no LICENSE`);
		}
	}

	for (const manifest of manifests) {
		const name = manifest.name as string;

		for (const field of [
			'dependencies',
			'peerDependencies',
			'optionalDependencies',
		]) {
			for (const [dep, range] of Object.entries<string>(
				(manifest[field] as Record<string, string>) ?? {},
			)) {
				if (/^(link|file):/.test(String(range))) {
					problems.push(`${name}: ${field}.${dep} = ${range}`);
				}
				if (dep === name) {
					problems.push(
						`${name}: ${field} lists itself as ${range}; a relative path ` +
							"there resolves to the CONSUMER's directory — " +
							'`exports` already makes the package self-referencing',
					);
				}
				if (own.has(dep) && /^\d/.test(String(range))) {
					problems.push(
						`${name}: ${field}.${dep} = ${range} pins a sibling exactly; ` +
							'use `workspace:^` so the consumer gets one copy',
					);
				}
				const sibling = own.get(dep);
				if (sibling && !Bun.semver.satisfies(sibling, String(range))) {
					problems.push(
						`${name}: ${field}.${dep} = ${range} excludes ${dep}@${sibling}, ` +
							'which is being published beside it; run `bun install` after ' +
							'`changeset version` so `bun.lock` carries the new numbers',
					);
				}
			}
		}

		const meta =
			(manifest.peerDependenciesMeta as Record<
				string,
				{ optional?: boolean }
			>) ?? {};
		for (const peer of Object.keys(
			(manifest.peerDependencies as Record<string, string>) ?? {},
		)) {
			if (meta[peer]?.optional || own.has(peer)) continue;
			const res = await fetch(
				`https://registry.npmjs.org/${peer.replace('/', '%2F')}`,
				{ method: 'HEAD' },
			).catch(() => null);
			if (!res?.ok) {
				problems.push(
					`${name}: peerDependencies.${peer} is required but is on no registry`,
				);
			}
		}
	}

	return problems;
}

/**
 * The newest mtime under a directory, or 0 if it does not exist. Deep, because
 * a build is only as fresh as its stalest input.
 */
async function newestMtime(dir: string, skip?: RegExp): Promise<number> {
	let newest = 0;
	const glob = new Bun.Glob('**/*');
	for await (const rel of glob.scan({ cwd: dir, onlyFiles: true })) {
		if (skip?.test(rel)) continue;
		const { mtimeMs } = await stat(join(dir, rel));
		if (mtimeMs > newest) newest = mtimeMs;
	}
	return newest;
}

/**
 * Specs and their snapshots live under `src/` but the build does not emit
 * them, so they cannot make `dist/` stale — and `bun test` rewrites a snapshot
 * file's mtime. CI runs the tests *between* the build and this script, so
 * counting them made a green pipeline fail with
 * `@nxgt/openapi-codegen: src/ is 57s newer than dist/`. Measured on
 * nxgt-http, 2026-09-22.
 */
const NOT_A_BUILD_INPUT = /(^|\/)__snapshots__\/|\.(spec|test)\.[cm]?[jt]sx?$/;

/**
 * Packages whose `dist/` is missing, or older than their own `src/`.
 *
 * This script packs `dist/` and does not build. CI builds first and so does
 * `changeset:publish`, so only a bare local `bun run verify:artifacts` can
 * verify yesterday's artifact — and `dist/` is gitignored, so the staleness is
 * invisible and cannot be reasoned about from the diff. Measured in `nxgt-core`
 * on 2026-09-22, where it cost an hour: four subpaths failed on `Cannot find
 * package 'stx-sdk'` while the same commit passed in CI, and a *resolution*
 * error sends you to the environment, not to the build.
 */
async function staleBuilds(pkgs: Pkg[]): Promise<string[]> {
	const stale: string[] = [];
	for (const pkg of pkgs) {
		const dist = await newestMtime(join(pkg.dir, 'dist'));
		if (dist === 0) {
			stale.push(`${pkg.name}: no dist/`);
			continue;
		}
		const src = await newestMtime(join(pkg.dir, 'src'), NOT_A_BUILD_INPUT);
		if (src > dist) {
			const age = Math.round((src - dist) / 1000);
			stale.push(`${pkg.name}: src/ is ${age}s newer than dist/`);
		}
	}
	return stale;
}

const packages = await readPackages();

const stale = await staleBuilds(packages);
if (stale.length > 0) {
	console.error('This would verify a stale build, not the working tree:\n');
	for (const one of stale) console.error(`  ${one}`);
	console.error(
		'\nRun `bun run build` first. This script packs `dist/`, which is\n' +
			'gitignored, so a stale one reports failures the source does not have —\n' +
			'and they look like environment problems, not build problems.',
	);
	process.exit(1);
}

const workdir = await mkdtemp(join(tmpdir(), 'nxgt-http-verify-'));

try {
	console.log(`Packing ${packages.length} packages…`);
	const tarballs: string[] = [];
	const overrides: Record<string, string> = {};
	for (const pkg of packages) {
		await $`bun pm pack --destination ${workdir}`.cwd(pkg.dir).quiet();
		const file = [...new Bun.Glob('*.tgz').scanSync(workdir)]
			.map((f) => join(workdir, f))
			.find((f) => !tarballs.includes(f));
		if (!file) throw new Error(`${pkg.name}: bun pm pack produced no tarball`);
		tarballs.push(file);
		overrides[pkg.name] = `file:${file}`;
	}

	const problems = await manifestProblems(tarballs);
	if (problems.length > 0) {
		console.error('\nA published manifest would break a consumer:\n');
		for (const problem of problems) console.error(`  ${problem}`);
		console.error(
			'\nA `link:` or `file:` no consumer can resolve, a required peer that is\n' +
				'on no registry, an exact pin on a sibling, a sibling range that\n' +
				'excludes the sibling published beside it, a package that lists\n' +
				'itself, or a license other than MIT or no LICENSE shipped. See\n' +
				'AGENTS.md.',
		);
		process.exit(1);
	}

	// An optional peer is installed only by whoever asks for it, so ask for each
	// one: `@nxgt/openapi-codegen`'s lint then loads because Redocly is installed
	// on purpose, not because another package's peer happened to hoist it. One
	// on no registry is left out, as the manifest check above allows.
	const optionalPeers: Record<string, string> = {};
	for (const tgz of tarballs) {
		const manifest = JSON.parse(
			await $`tar -xzOf ${tgz} package/package.json`.quiet().text(),
		);
		const meta: Record<string, { optional?: boolean }> =
			manifest.peerDependenciesMeta ?? {};
		for (const [peer, range] of Object.entries<string>(
			manifest.peerDependencies ?? {},
		)) {
			if (!meta[peer]?.optional || peer in overrides || peer in optionalPeers) {
				continue;
			}
			const res = await fetch(
				`https://registry.npmjs.org/${peer.replace('/', '%2F')}`,
				{ method: 'HEAD' },
			).catch(() => null);
			if (res?.ok) optionalPeers[peer] = range;
		}
	}

	await Bun.write(
		join(workdir, 'package.json'),
		`${JSON.stringify(
			{
				name: 'nxgt-http-artifact-probe',
				private: true,
				version: '0.0.0',
				type: 'module',
				dependencies: { ...optionalPeers, ...overrides },
				overrides,
				resolutions: overrides,
			},
			null,
			2,
		)}\n`,
	);

	console.log('Installing them as a consumer would…');
	const install = await $`bun install`.cwd(workdir).quiet().nothrow();
	if (install.exitCode !== 0) {
		console.error(`\n${install.stderr.toString().trim()}`);
		console.error(
			'\nThe install failed. A required peer on a package that is on no\n' +
				'registry is the usual cause — an optional one never fails an install.',
		);
		process.exit(1);
	}

	const subpaths = packages.flatMap((p) => p.subpaths);
	console.log(`Importing ${subpaths.length} declared subpaths…\n`);
	const probe = subpaths
		.map(
			(s) =>
				`try { const m = await import(${JSON.stringify(s)});` +
				` console.log("  ok      ${s.padEnd(40)}" + Object.keys(m).length + " exports"); }` +
				` catch (e) { failed++; console.log("  FAIL    ${s.padEnd(40)}" + e.message.split("\\n")[0]); }`,
		)
		.join('\n');
	await Bun.write(
		join(workdir, 'probe.mjs'),
		`let failed = 0;\n${probe}\nprocess.exit(failed);\n`,
	);

	const result = await $`bun run probe.mjs`.cwd(workdir).nothrow();
	if (result.exitCode !== 0) {
		console.error(
			`\n${result.exitCode} subpath(s) failed to load from the built artifact.\n` +
				'A build exiting 0 is not evidence the artifact loads. See AGENTS.md.',
		);
		process.exit(1);
	}
	console.log(`\nAll ${subpaths.length} subpaths load.`);

	// ── types, as a consumer resolves them ────────────────────────────────────
	//
	// Loading proves the JavaScript. The declarations are another artifact,
	// resolved another way: a consumer on `moduleResolution: nodenext` refuses
	// a relative import without an extension (TS2834), and with `skipLibCheck`
	// — the default of most templates — says nothing and types the whole
	// package `any`. Measured on this package's own tarball before `build.ts`
	// added the extensions: seven refusals on the root entry alone, and none
	// with `skipLibCheck`. So the check runs without it, once per resolution a
	// consumer uses, and fails only on what this workspace wrote: a dependency's
	// declarations are not ours to fix.
	//
	// The consumer runs on Bun, with the `@types/bun` this workspace pins: these
	// packages are built for it, and some declarations name `bun` or Node's
	// `Buffer`, which only a runtime's types provide.
	console.log('\nTypechecking every subpath as a consumer…\n');
	const bunTypes =
		(await Bun.file(join(ROOT, 'package.json')).json()).devDependencies?.[
			'@types/bun'
		] ?? 'latest';
	const addTypes = await $`bun add -d ${`@types/bun@${bunTypes}`}`
		.cwd(workdir)
		.quiet()
		.nothrow();
	if (addTypes.exitCode !== 0) {
		console.error(addTypes.stderr.toString());
		process.exit(1);
	}
	await Bun.write(
		join(workdir, 'types.ts'),
		`${subpaths.map((s, n) => `import * as m${n} from ${JSON.stringify(s)};`).join('\n')}\n` +
			`export const all = [${subpaths.map((_, n) => `m${n}`).join(', ')}];\n`,
	);
	const ours = packages.map((p) => `node_modules/${p.name}/`);
	let untyped = 0;
	for (const resolution of ['nodenext', 'bundler'] as const) {
		await Bun.write(
			join(workdir, `tsconfig.${resolution}.json`),
			JSON.stringify({
				compilerOptions: {
					strict: true,
					noEmit: true,
					skipLibCheck: false,
					module: resolution === 'nodenext' ? 'nodenext' : 'preserve',
					moduleResolution: resolution,
					target: 'esnext',
					lib: ['esnext', 'dom'],
					types: ['bun'],
				},
				files: ['types.ts'],
			}),
		);
		const tsc =
			await $`${join(ROOT, 'node_modules/.bin/tsc')} -p tsconfig.${resolution}.json`
				.cwd(workdir)
				.quiet()
				.nothrow();
		const errors = tsc.stdout
			.toString()
			.split('\n')
			.filter((line) => /: error TS\d+/.test(line))
			.filter(
				(line) =>
					line.startsWith('types.ts') ||
					ours.some((prefix) => line.startsWith(prefix)),
			);
		if (errors.length === 0) {
			console.log(`  ok      ${resolution}`);
			continue;
		}
		untyped++;
		console.log(`  FAIL    ${resolution}: ${errors.length} error(s)`);
		for (const line of errors.slice(0, 5)) console.log(`          ${line}`);
	}
	if (untyped > 0) {
		console.error(
			'\nA consumer would not see these types. A relative import without an\n' +
				'extension is the usual cause; build.ts adds them — see its comment.',
		);
		process.exit(1);
	}
	console.log('\nEvery subpath typechecks under nodenext and bundler.');

	// ── one class per package ─────────────────────────────────────────────────
	//
	// A class must be DEFINED once in a package, not once per entry point.
	// `Bun.build` inlines a shared module into every entry bundle unless
	// `splitting` is on, so a package with several entry points can hand an app
	// two `ValidationError`s — the failure `packages: 'external'` was chosen to
	// prevent, arriving from the other side. `@nxgt/httpyz` shipped exactly that
	// for six error classes: `/integration` re-exports `METHODS`, which pulled
	// `create-http-client` and the whole error hierarchy in behind it.
	//
	// Why the shape of this check is a grep and not an `instanceof` probe: none
	// of `/integration`'s exports throws today, so the duplication was inert —
	// real in the artifact, unreachable through the export surface. A runtime
	// probe would have passed. The next export added to `/integration` is what
	// makes it bite, and by then nobody is looking.
	//
	// Against the INSTALLED TARBALL, like everything else here: that is the only
	// artifact a consumer sees.
	console.log('\nChecking each class is defined once per package…\n');
	let duplicated = 0;
	for (const pkg of packages) {
		const dist = join(workdir, 'node_modules', pkg.name, 'dist');
		const where = new Map<string, string[]>();
		const glob = new Bun.Glob('**/*.js');
		for await (const rel of glob.scan({ cwd: dist, onlyFiles: true })) {
			// Chunks are the fix, not the symptom: a class defined in one shared
			// chunk is exactly what this asserts, so only entry bundles are read.
			if (rel.startsWith('chunks/')) continue;
			const text = await Bun.file(join(dist, rel)).text();
			for (const match of text.matchAll(/^class ([A-Za-z_$][\w$]*)/gm)) {
				const cls = match[1];
				if (!cls) continue;
				where.set(cls, [...(where.get(cls) ?? []), rel]);
			}
		}
		const twice = [...where].filter(([, files]) => files.length > 1);
		if (twice.length === 0) {
			console.log(`  ok      ${pkg.name}`);
			continue;
		}
		duplicated++;
		for (const [cls, files] of twice) {
			console.log(`  FAIL    ${pkg.name}: ${cls} in ${files.join(', ')}`);
		}
	}
	if (duplicated > 0) {
		console.error(
			`\n${duplicated} package(s) define a class more than once. An ` +
				'`instanceof` across\ntwo entry points of such a package is false, and ' +
				'nothing else reports it —\nit typechecks, and every subpath loads. ' +
				'`splitting: true` in build.ts is what\nshares them; see its comment.',
		);
		process.exit(1);
	}
	console.log(
		`\nEach class is defined once in all ${packages.length} packages.`,
	);

	const bins = packages.flatMap((p) => p.bins);
	if (bins.length > 0) {
		console.log(`\nRunning ${bins.length} declared bin(s) with --help…\n`);
		let broken = 0;
		for (const bin of bins) {
			const ran = await $`./node_modules/.bin/${bin} --help`
				.cwd(workdir)
				.quiet()
				.nothrow();
			const ok = ran.exitCode === 0;
			if (!ok) broken++;
			console.log(
				`  ${ok ? 'ok  ' : 'FAIL'}    ${bin.padEnd(40)}` +
					(ok ? '' : ran.stderr.toString().split('\n')[0]),
			);
		}
		if (broken > 0) {
			console.error(
				`\n${broken} bin(s) failed to run from node_modules/.bin. A missing #!\n` +
					'line or a non-executable file is the usual cause; build.ts checks both.',
			);
			process.exit(1);
		}
		console.log(`\nAll ${bins.length} bin(s) run.`);
	}
} finally {
	await rm(workdir, { recursive: true, force: true });
}
