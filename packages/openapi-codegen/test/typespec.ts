/**
 * Compiles `fixtures/typespec/` with the TypeSpec pinned in package.json, as
 * an app would: `tsp compile` on the project, which reads its `tspconfig.yaml`.
 * `src/typespec.spec.ts` compiles it into a scratch directory and fails when
 * the committed `openapi.yaml` differs. Run as a script, this rewrites it:
 * `bun run fixtures:typespec`.
 */
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { $ } from 'bun';

export const TYPESPEC_PROJECT = fileURLToPath(
	new URL('./fixtures/typespec/', import.meta.url),
);

/**
 * Compiles the project into `outputDir`, failing on any warning with what
 * the compiler printed. `--no-install`: without the pinned `tsp`, bunx would
 * fetch an unrelated package of that name.
 */
export async function compileTypeSpec(outputDir: string): Promise<void> {
	const result =
		await $`bunx --no-install tsp compile ${TYPESPEC_PROJECT} --warn-as-error --option ${`@typespec/openapi3.emitter-output-dir=${outputDir}`}`
			.cwd(TYPESPEC_PROJECT)
			.quiet()
			.nothrow();
	if (result.exitCode !== 0) {
		throw new Error(
			`tsp compile failed with exit code ${result.exitCode}:\n${result.stdout}${result.stderr}`,
		);
	}
}

/** What the project emits now, compiled into a scratch directory. */
export async function emittedOpenAPI(): Promise<string> {
	const outputDir = await mkdtemp(join(tmpdir(), 'nxgt-typespec-'));
	try {
		await compileTypeSpec(outputDir);
		return await readFile(join(outputDir, 'openapi.yaml'), 'utf8');
	} finally {
		await rm(outputDir, { recursive: true, force: true });
	}
}

if (import.meta.main) await compileTypeSpec(TYPESPEC_PROJECT);
