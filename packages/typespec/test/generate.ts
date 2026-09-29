/**
 * Compiles each fixture under `fixtures/` with the TypeSpec pinned in
 * package.json, and writes its generated code under `generated/`, which git
 * ignores. `fixtures/<case>/openapi.yaml` is committed: `src/fixtures.spec.ts`
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
export const CASES = ['errors'] as const;

export const project = (name: string) => `${TEST_DIR}fixtures/${name}/`;

/**
 * Compiles a case into `outputDir`, failing on any warning with what the
 * compiler printed. `--no-install`: without the pinned `tsp`, bunx would
 * fetch an unrelated package of that name.
 */
export async function compile(name: string, outputDir: string): Promise<void> {
	const result =
		await $`bunx --no-install tsp compile ${project(name)} --warn-as-error --option ${`@typespec/openapi3.emitter-output-dir=${outputDir}`}`
			.cwd(project(name))
			.quiet()
			.nothrow();
	if (result.exitCode !== 0) {
		throw new Error(
			`tsp compile ${name} failed with exit code ${result.exitCode}:\n${result.stdout}${result.stderr}`,
		);
	}
}

/** What a case compiles to now, in a scratch directory. */
export async function emitted(name: string): Promise<string> {
	const outputDir = await mkdtemp(join(tmpdir(), 'nxgt-typespec-'));
	try {
		await compile(name, outputDir);
		return await readFile(join(outputDir, 'openapi.yaml'), 'utf8');
	} finally {
		await rm(outputDir, { recursive: true, force: true });
	}
}

if (import.meta.main) {
	const accept = process.argv.includes('--accept');
	for (const name of CASES) {
		if (accept) await compile(name, project(name));
		await generate(
			{
				input: `fixtures/${name}/openapi.yaml`,
				output: `generated/${name}`,
				hono: true,
			},
			{ cwd: TEST_DIR },
		);
	}
}
