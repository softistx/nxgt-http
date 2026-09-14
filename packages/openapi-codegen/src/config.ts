/**
 * `openapi-codegen.config.ts`: what the `nxgt-openapi` command generates. A
 * config is the options `generate()` takes, or a list of them for several
 * specs, and its relative paths resolve against the config file's directory.
 */
import { access } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { CodegenError } from './errors';
import { DEFAULT_OUTPUT, type GenerateOptions } from './generate';

/** One spec to generate: the options of `generate()`. `--check` decides the rest. */
export type CodegenConfig = GenerateOptions;

/** What a list of configs can share: every option but each spec's own `input` and `output`. */
export type SharedConfig = Omit<CodegenConfig, 'input' | 'output'>;

/**
 * Types a config file: `export default defineConfig({ input })`, or a list
 * of them. With a list, `shared` is laid under every entry: an entry's own
 * option wins, and `names` merge, the entry's winning per key.
 */
export function defineConfig<const T extends CodegenConfig>(config: T): T;
export function defineConfig(
	configs: readonly CodegenConfig[],
	shared?: SharedConfig,
): CodegenConfig[];
export function defineConfig(
	config: CodegenConfig | readonly CodegenConfig[],
	shared?: SharedConfig,
): CodegenConfig | CodegenConfig[] {
	if (!isList(config)) return config;
	if (shared === undefined) return [...config];
	if ('input' in shared || 'output' in shared) {
		throw invalid(
			'a shared config cannot set input or output: they are each spec’s own',
		);
	}
	return config.map((one) => {
		const merged: CodegenConfig = { ...shared, ...one };
		if (shared.names !== undefined || one.names !== undefined) {
			merged.names = { ...shared.names, ...one.names };
		}
		return merged;
	});
}

const isList = (
	config: CodegenConfig | readonly CodegenConfig[],
): config is readonly CodegenConfig[] => Array.isArray(config);

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

const isConfig = (value: unknown): value is CodegenConfig => {
	if (typeof value !== 'object' || value === null) return false;
	const { input, output } = value as Partial<CodegenConfig>;
	return (
		typeof input === 'string' &&
		(output === undefined || typeof output === 'string')
	);
};

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
				: `no config file: create ${CONFIG_FILES[0]}, or pass --input`,
		);
	}
	const module: { default?: unknown } = await import(pathToFileURL(file).href);
	const configs: unknown[] = Array.isArray(module.default)
		? module.default
		: [module.default];
	if (configs.length === 0 || !configs.every(isConfig)) {
		throw invalid(
			`${path ?? file}: export default a config, or a list of them, each with an input, and an output if not ${DEFAULT_OUTPUT}`,
		);
	}
	// Two specs in one directory would overwrite each other's files.
	const outputs = new Map<string, string>();
	for (const config of configs) {
		const output = resolve(dirname(file), config.output ?? DEFAULT_OUTPUT);
		const other = outputs.get(output);
		if (other !== undefined) {
			throw invalid(
				`${path ?? file}: ${other} and ${config.input} both write to ${config.output ?? DEFAULT_OUTPUT}; give each an output of its own`,
			);
		}
		outputs.set(output, config.input);
	}
	return { file, configs };
}
