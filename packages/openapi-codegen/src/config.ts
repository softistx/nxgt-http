/**
 * `openapi-codegen.config.ts`: what the `nxgt-openapi` command generates. A
 * config is the options `generate()` takes, or a list of them for several
 * specs, and its relative paths resolve against the config file's directory.
 */
import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { CodegenError } from './errors';
import type { GenerateOptions } from './generate';

/** One spec to generate: the options of `generate()`. `--check` decides the rest. */
export type CodegenConfig = GenerateOptions;

/** Types a config file: `export default defineConfig({ input, output })`, or a list of them. */
export function defineConfig<
	const T extends CodegenConfig | readonly CodegenConfig[],
>(config: T): T {
	return config;
}

/** Looked up in this order when no config file is named. */
export const CONFIG_FILES = [
	'openapi-codegen.config.ts',
	'openapi-codegen.config.mts',
	'openapi-codegen.config.js',
	'openapi-codegen.config.mjs',
] as const;

export interface LoadedConfig {
	/** The config file, absolute. Relative paths in `configs` resolve against its directory. */
	file: string;
	configs: CodegenConfig[];
}

const invalid = (message: string): CodegenError =>
	new CodegenError([{ severity: 'error', code: 'invalid_config', message }]);

async function exists(path: string): Promise<boolean> {
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
}

const isConfig = (value: unknown): value is CodegenConfig =>
	typeof value === 'object' &&
	value !== null &&
	typeof (value as Partial<CodegenConfig>).input === 'string' &&
	typeof (value as Partial<CodegenConfig>).output === 'string';

/**
 * Finds, imports and checks a config file: `path` when given, else the first
 * of `CONFIG_FILES` in `cwd`. Throws a `CodegenError` (`invalid_config`) when
 * there is none, or when what it exports is not a config.
 */
export async function loadConfig(
	path?: string,
	cwd = process.cwd(),
): Promise<LoadedConfig> {
	const candidates = path
		? [resolve(cwd, path)]
		: CONFIG_FILES.map((name) => resolve(cwd, name));
	let file: string | undefined;
	for (const candidate of candidates) {
		if (await exists(candidate)) {
			file = candidate;
			break;
		}
	}
	if (file === undefined) {
		throw invalid(
			path
				? `config file ${path} not found`
				: `no config file: create ${CONFIG_FILES[0]}, or pass --input and --output`,
		);
	}
	const module: { default?: unknown } = await import(pathToFileURL(file).href);
	const configs: unknown[] = Array.isArray(module.default)
		? module.default
		: [module.default];
	if (configs.length === 0 || !configs.every(isConfig)) {
		throw invalid(
			`${path ?? file}: export default a config, or a list of them, each with an input and an output`,
		);
	}
	return { file, configs };
}
