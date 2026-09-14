import { afterAll, describe, expect, it } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run } from './run';

const SPEC = JSON.stringify({
	openapi: '3.1.0',
	info: { title: 't', version: '1' },
	paths: {},
	components: {
		schemas: {
			Pet: { type: 'object', properties: { name: { type: 'string' } } },
		},
	},
});

const dirs: string[] = [];
afterAll(() => Promise.all(dirs.map((dir) => rm(dir, { recursive: true }))));

/** A project holding `openapi.json`, and these files. */
async function project(files: Record<string, string> = {}): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), 'openapi-cli-'));
	dirs.push(dir);
	await writeFile(join(dir, 'openapi.json'), SPEC);
	for (const [name, content] of Object.entries(files)) {
		await writeFile(join(dir, name), content);
	}
	return dir;
}

/** Runs the command in `cwd`, collecting what it prints. */
async function cli(args: string[], cwd: string) {
	const out: string[] = [];
	const err: string[] = [];
	const code = await run(args, {
		cwd,
		version: '9.9.9',
		out: (line) => out.push(line),
		err: (line) => err.push(line),
	});
	return { code, out: out.join('\n'), err: err.join('\n') };
}

const exists = (path: string) => Bun.file(path).exists();

describe('nxgt-openapi', () => {
	it('prints its usage and its version', async () => {
		const cwd = await project();
		const help = await cli(['--help'], cwd);
		expect(help.code).toBe(0);
		expect(help.out).toStartWith('Usage: nxgt-openapi generate');
		expect(await cli(['--version'], cwd)).toMatchObject({
			code: 0,
			out: '9.9.9',
		});
	});

	it('generates from openapi-codegen.config.ts in the current directory', async () => {
		const cwd = await project({
			'openapi-codegen.config.ts':
				"export default { input: 'openapi.json', output: 'gen' };\n",
		});
		expect(await cli(['generate'], cwd)).toMatchObject({
			code: 0,
			out: 'openapi.json → gen: 4 written, 0 unchanged',
		});
		expect(await exists(join(cwd, 'gen/zod.ts'))).toBe(true);
	});

	it('reads a list of configs, relative to the config file', async () => {
		const cwd = await project();
		await mkdir(join(cwd, 'api'));
		await writeFile(join(cwd, 'api/openapi.json'), SPEC);
		await writeFile(
			join(cwd, 'api/codegen.config.mjs'),
			"export default [{ input: 'openapi.json', output: 'a' }, { input: '../openapi.json', output: 'b', enums: 'union' }];\n",
		);
		const { code, out } = await cli(
			['generate', '--config', 'api/codegen.config.mjs'],
			cwd,
		);
		expect(code).toBe(0);
		expect(out).toBe(
			'api/openapi.json → api/a: 4 written, 0 unchanged\nopenapi.json → api/b: 4 written, 0 unchanged',
		);
		expect(await exists(join(cwd, 'api/b/types.ts'))).toBe(true);
	});

	it('exits 1 on drift with --check, writing nothing, and 0 once up to date', async () => {
		const cwd = await project();
		const args = ['generate', '-i', 'openapi.json', '-o', 'gen'];
		const missing = await cli([...args, '--check'], cwd);
		expect(missing.code).toBe(1);
		expect(missing.out).toContain('  gen/types.ts');
		expect(await exists(join(cwd, 'gen/types.ts'))).toBe(false);
		expect((await cli(args, cwd)).code).toBe(0);
		expect(await cli([...args, '--check'], cwd)).toMatchObject({
			code: 0,
			out: 'openapi.json → gen: up to date',
		});
	});

	it('writes to generated/openapi when no output is given', async () => {
		const cwd = await project({
			'openapi-codegen.config.ts':
				"export default { input: 'openapi.json' };\n",
		});
		expect(await cli(['generate'], cwd)).toMatchObject({
			code: 0,
			out: 'openapi.json → generated/openapi: 4 written, 0 unchanged',
		});
		expect(await cli(['generate', '-i', 'openapi.json'], cwd)).toMatchObject({
			code: 0,
			out: 'openapi.json → generated/openapi: 0 written, 4 unchanged',
		});
		expect(await exists(join(cwd, 'generated/openapi/types.ts'))).toBe(true);
		expect((await cli(['generate', '-o', 'gen'], cwd)).code).toBe(2);
	});

	it('exits 1 with every error when the spec cannot be generated', async () => {
		const cwd = await project({
			'bad.json': JSON.stringify({
				openapi: '3.1.0',
				info: { title: 't', version: '1' },
				paths: {},
				components: { schemas: { A: { not: {} } } },
			}),
		});
		const { code, err } = await cli(
			['generate', '-i', 'bad.json', '-o', 'gen'],
			cwd,
		);
		expect(code).toBe(1);
		expect(err).toContain('[unsupported_keyword]');
	});

	it('lints each spec with Redocly first under --lint', async () => {
		const cwd = await project({
			'redocly.yaml': 'rules:\n  info-license: error\n',
		});
		const args = ['generate', '-i', 'openapi.json', '-o', 'gen'];
		expect((await cli(args, cwd)).code).toBe(0);
		const { code, err } = await cli([...args, '--lint'], cwd);
		expect(code).toBe(1);
		expect(err).toStartWith('error openapi.json:1:');
		expect(err).toEndWith('(info-license) [lint_error]');
	});

	it('exits 1 when there is no config file, or it exports no config', async () => {
		const cwd = await project({ 'empty.config.mjs': 'export default {};\n' });
		for (const args of [
			['generate'],
			['generate', '-c', 'missing.ts'],
			['generate', '-c', 'empty.config.mjs'],
		]) {
			const { code, err } = await cli(args, cwd);
			expect(code).toBe(1);
			expect(err).toContain('[invalid_config]');
		}
	});

	it('exits 2 on a command line it does not understand', async () => {
		const cwd = await project();
		for (const args of [
			[],
			['build'],
			['generate', '--nope'],
			['generate', '-o', 'gen'],
			['generate', '-c', 'x.ts', '-i', 'a', '-o', 'b'],
		]) {
			const { code, err } = await cli(args, cwd);
			expect(code).toBe(2);
			expect(err).toContain('Usage: nxgt-openapi generate');
		}
	});

	it('runs as a process, reporting the version of its package.json', async () => {
		const manifest = await Bun.file(
			join(import.meta.dir, '../../package.json'),
		).json();
		const child = Bun.spawn(
			['bun', join(import.meta.dir, '../cli.ts'), '--version'],
			{ stdout: 'pipe' },
		);
		expect(await new Response(child.stdout).text()).toBe(
			`${manifest.version}\n`,
		);
		expect(await child.exited).toBe(0);
	});
});
