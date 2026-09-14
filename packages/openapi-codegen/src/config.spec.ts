import { afterAll, describe, expect, it } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig, loadConfig, type SharedConfig } from './config';
import { CodegenError } from './errors';

const dirs: string[] = [];
afterAll(() => Promise.all(dirs.map((dir) => rm(dir, { recursive: true }))));

describe('defineConfig', () => {
	it('returns a single config as it is', () => {
		const config = { input: 'openapi.yaml', hono: true };
		expect(defineConfig(config)).toBe(config);
	});

	it('lays a shared config under every entry of a list', () => {
		const configs = defineConfig(
			[
				{ input: 'public.yaml', output: 'gen/public' },
				{
					input: 'admin.yaml',
					output: 'gen/admin',
					dates: 'string',
					names: { 'admin.yaml#/components/schemas/Error': 'AdminError' },
				},
			],
			{
				hono: true,
				dates: 'date',
				names: { 'common.yaml#/components/schemas/Error': 'ApiError' },
			},
		);
		expect(configs).toEqual([
			{
				input: 'public.yaml',
				output: 'gen/public',
				hono: true,
				dates: 'date',
				names: { 'common.yaml#/components/schemas/Error': 'ApiError' },
			},
			{
				input: 'admin.yaml',
				output: 'gen/admin',
				hono: true,
				dates: 'string',
				names: {
					'common.yaml#/components/schemas/Error': 'ApiError',
					'admin.yaml#/components/schemas/Error': 'AdminError',
				},
			},
		]);
	});

	it('lays a shared config under a single one too', () => {
		const one = { input: 'a.yaml', dates: 'string' } as const;
		// The overloads refuse it; a plain `.js` config file does not know.
		const define = defineConfig as (
			config: typeof one,
			shared: SharedConfig,
		) => unknown;
		expect(define(one, { hono: true, dates: 'date' })).toEqual({
			input: 'a.yaml',
			hono: true,
			dates: 'string',
		});
	});

	it('refuses a shared input or output', () => {
		const shared = { output: 'gen' } as SharedConfig;
		expect(() => defineConfig([{ input: 'a.yaml' }], shared)).toThrow(
			'a shared config cannot set input or output',
		);
	});
});

describe('loadConfig', () => {
	it('refuses two configs that write to the same directory', async () => {
		const dir = await mkdtemp(join(tmpdir(), 'openapi-config-'));
		dirs.push(dir);
		const file = join(dir, 'openapi-codegen.config.mjs');
		await writeFile(
			file,
			"export default [{ input: 'a.yaml' }, { input: 'b.yaml', output: './generated/openapi/' }];\n",
		);
		const error = await loadConfig(undefined, dir).catch(
			(caught: unknown) => caught,
		);
		expect(error).toBeInstanceOf(CodegenError);
		expect((error as CodegenError).diagnostics[0]?.message).toContain(
			'a.yaml and b.yaml both write to ./generated/openapi/',
		);
	});
});
