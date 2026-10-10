/**
 * Compiles each fixture under `fixtures/` with the TypeSpec pinned in
 * package.json, to OpenAPI 3.1 and 3.2 alike, and writes the code generated
 * from each under `generated/<case>/<version>/`, which git ignores.
 * `fixtures/<case>/<version>/openapi.yaml` is committed: `src/fixtures.spec.ts`
 * fails when it is not what the `.tsp` compiles to, and
 * `bun run fixtures:typespec` rewrites it. The `test` and `typecheck`
 * scripts run this first.
 */
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generate } from '@nxgt/openapi-codegen';
import { $ } from 'bun';

const TEST_DIR = fileURLToPath(new URL('./', import.meta.url));

/** One per convention: each `.tsp` imports `@nxgt/typespec` as an app does. */
export const CASES = ['errors', 'blog', 'scalars', 'queries'] as const;

/** Every fixture's `tspconfig.yaml` emits both, each in its own folder... */
export const VERSIONS = ['3.1.0', '3.2.0'] as const;

/** ...but `queries`: a `@queryMethod` is a `QUERY`, which only 3.2 has. */
export const versionsOf = (name: string): readonly string[] =>
	name === 'queries' ? ['3.2.0'] : VERSIONS;

export const project = (name: string) => `${TEST_DIR}fixtures/${name}/`;

/** The spec a case compiles to, for one OpenAPI version. */
export const spec = (name: string, version: string) =>
	`${project(name)}${version}/openapi.yaml`;

/**
 * Compiles a case into `outputDir`, failing on any warning with what the
 * compiler printed. `--no-install`: without the pinned `tsp`, bunx would
 * fetch an unrelated package of that name.
 */
export async function compile(name: string, outputDir: string): Promise<void> {
	const result =
		await $`bunx --no-install tsp compile ${project(name)} --warn-as-error --option ${`@nxgt/typespec.emitter-output-dir=${outputDir}`}`
			.cwd(project(name))
			.quiet()
			.nothrow();
	if (result.exitCode !== 0) {
		throw new Error(
			`tsp compile ${name} failed with exit code ${result.exitCode}:\n${result.stdout}${result.stderr}`,
		);
	}
}

/** What a case compiles to now, for each version, in a scratch directory. */
export async function emitted(name: string): Promise<Record<string, string>> {
	const outputDir = await mkdtemp(join(tmpdir(), 'nxgt-typespec-'));
	try {
		await compile(name, outputDir);
		const specs: Record<string, string> = {};
		for (const version of versionsOf(name)) {
			specs[version] = await readFile(
				join(outputDir, version, 'openapi.yaml'),
				'utf8',
			);
		}
		return specs;
	} finally {
		await rm(outputDir, { recursive: true, force: true });
	}
}

if (import.meta.main) {
	const accept = process.argv.includes('--accept');
	// From scratch, so a file the generator stopped writing does not linger.
	await rm(`${TEST_DIR}generated`, { recursive: true, force: true });
	for (const name of CASES) {
		if (accept) await compile(name, project(name));
		for (const version of versionsOf(name)) {
			await generate(
				{
					input: spec(name, version),
					output: `generated/${name}/${version}`,
					hono: true,
				},
				{ cwd: TEST_DIR },
			);
		}
	}
}
