import { afterAll, describe, expect, it } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CodegenError, formatDiagnostic } from './errors';
import { type GenerateOptions, generateFiles } from './generate';
import { createMemoryFileSystem } from './loader/fs';

const SPEC = `openapi: 3.1.0
info:
  title: t
  version: '1'
paths:
  /pets:
    get:
      operationId: listPets
      responses:
        '200':
          description: ok
`;

/** A `redocly.yaml` that runs these rules, and only these. */
const rules = (set: Record<string, string>) =>
	`rules:\n${Object.entries(set)
		.map(([rule, severity]) => `  ${rule}: ${severity}\n`)
		.join('')}`;

const dirs: string[] = [];
afterAll(() => Promise.all(dirs.map((dir) => rm(dir, { recursive: true }))));

/** A project holding `openapi.yaml`, and these files. */
async function project(files: Record<string, string> = {}): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), 'openapi-lint-'));
	dirs.push(dir);
	await writeFile(join(dir, 'openapi.yaml'), SPEC);
	for (const [name, content] of Object.entries(files)) {
		await writeFile(join(dir, name), content);
	}
	return dir;
}

const run = (cwd: string, lint: GenerateOptions['lint']) =>
	generateFiles({ input: 'openapi.yaml', output: 'gen', lint }, { cwd });

const failure = (promise: Promise<unknown>) =>
	promise.then(
		() => {
			throw new Error('expected a CodegenError');
		},
		(error: unknown) => {
			expect(error).toBeInstanceOf(CodegenError);
			return (error as CodegenError).diagnostics;
		},
	);

describe('lint', () => {
	it('stops the run on a lint error, pointing at its line', async () => {
		const cwd = await project({
			'redocly.yaml': rules({ 'operation-summary': 'error' }),
		});
		const [diagnostic, ...rest] = await failure(run(cwd, true));
		expect(rest).toEqual([]);
		expect(diagnostic).toMatchObject({
			severity: 'error',
			code: 'lint_error',
			file: join(cwd, 'openapi.yaml'),
			pointer: '/paths/~1pets/get/summary',
		});
		expect(diagnostic && formatDiagnostic(diagnostic, cwd)).toBe(
			'error openapi.yaml:7:5: Operation object should contain `summary` field. (operation-summary) [lint_error]',
		);
	});

	it('generates past a lint warning, and returns it with the others', async () => {
		const cwd = await project({
			'redocly.yaml': rules({ 'info-license': 'warn' }),
		});
		const { files, warnings } = await run(cwd, true);
		expect(files).toHaveLength(4);
		expect(warnings.map((w) => w.code)).toEqual(['lint_warning']);
		expect(await run(cwd, false)).toMatchObject({ warnings: [] });
	});

	it('reads the Redocly config it names, relative to cwd', async () => {
		const cwd = await project({
			'strict.yaml': rules({ 'info-license': 'error' }),
		});
		const diagnostics = await failure(run(cwd, 'strict.yaml'));
		expect(diagnostics.map((d) => d.code)).toEqual(['lint_error']);
		const missing = await failure(run(cwd, 'missing.yaml'));
		expect(missing.map((d) => d.code)).toEqual(['invalid_option']);
		expect(missing[0]?.message).toStartWith(
			'lint: the Redocly config cannot be loaded:',
		);
	});

	it('refuses a lint it cannot take, and lint over an in-memory spec', async () => {
		const cwd = await project();
		for (const bad of [1, ''] as never[]) {
			const [diagnostic] = await failure(run(cwd, bad));
			expect(diagnostic?.code).toBe('invalid_option');
		}
		const fs = createMemoryFileSystem({ '/s/openapi.yaml': SPEC });
		const [diagnostic] = await failure(
			generateFiles(
				{ input: '/s/openapi.yaml', output: '/s/gen', lint: true },
				{ fs },
			),
		);
		expect(diagnostic?.message).toBe(
			'lint reads the spec from disk: it cannot be used with fs',
		);
	});

	it("passes Redocly's own Museum API with Redocly's defaults", async () => {
		const input = fileURLToPath(
			new URL(
				'../test/fixtures/conformance/redocly-museum/openapi.yaml',
				import.meta.url,
			),
		);
		const { warnings } = await generateFiles({
			input,
			output: '/unused',
			lint: true,
		});
		expect(warnings.filter((w) => w.code.startsWith('lint_'))).toEqual([]);
	});
});
