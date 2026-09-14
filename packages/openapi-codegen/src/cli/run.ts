/**
 * `nxgt-openapi`: the command line around `generate()`. `run` takes the
 * arguments and returns the exit code, printing through `out` and `err`, so
 * it is tested without spawning a process.
 */
import { dirname, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { type CodegenConfig, loadConfig } from '../config';
import { CodegenError, formatDiagnostic } from '../errors';
import { DEFAULT_OUTPUT, generate } from '../generate';

export const USAGE = `Usage: nxgt-openapi generate [options]

Generates TypeScript types, Zod validators and the operations map from an
OpenAPI 3.1 or 3.2 document.

Options:
  -c, --config <file>  the config file (default: openapi-codegen.config.ts,
                       .mts, .js or .mjs in the current directory)
  -i, --input <file>   the spec's root document, instead of a config file
  -o, --output <dir>   where the files go, with --input
                       (default: generated/openapi)
      --check          write nothing; exit 1 when a file is missing or stale
      --lint           lint each spec with Redocly first; needs
                       @redocly/openapi-core
  -h, --help           show this help
  -v, --version        print the version

Exit codes: 0 done; 1 the spec cannot be generated, or --check found drift;
2 the command line is wrong.`;

export interface RunContext {
	/** Where relative paths on the command line resolve. Default `process.cwd()`. */
	cwd?: string;
	/** Printed by `--version`. */
	version?: string;
	out?: (line: string) => void;
	err?: (line: string) => void;
}

const OPTIONS = {
	config: { type: 'string', short: 'c' },
	input: { type: 'string', short: 'i' },
	output: { type: 'string', short: 'o' },
	check: { type: 'boolean' },
	lint: { type: 'boolean' },
	help: { type: 'boolean', short: 'h' },
	version: { type: 'boolean', short: 'v' },
} as const;

/** The arguments, or the error `parseArgs` throws on an unknown flag. */
function parse(args: readonly string[]) {
	try {
		return parseArgs({
			args: [...args],
			options: OPTIONS,
			allowPositionals: true,
		});
	} catch (error) {
		return error as Error;
	}
}

export async function run(
	args: readonly string[],
	{
		cwd = process.cwd(),
		version = 'unknown',
		out = console.log,
		err = console.error,
	}: RunContext = {},
): Promise<number> {
	const usage = (message: string): number => {
		err(`${message}\n\n${USAGE}`);
		return 2;
	};
	const parsed = parse(args);
	if (parsed instanceof Error) return usage(parsed.message);
	const { values, positionals } = parsed;
	if (values.help) {
		out(USAGE);
		return 0;
	}
	if (values.version) {
		out(version);
		return 0;
	}
	const [command, ...rest] = positionals;
	if (command === undefined) return usage('nxgt-openapi needs a command');
	if (command !== 'generate' || rest.length > 0) {
		return usage(`unknown command: ${positionals.join(' ')}`);
	}
	const { config, input, output } = values;
	if (config !== undefined && (input !== undefined || output !== undefined)) {
		return usage('pass either --config, or --input');
	}
	if (output !== undefined && input === undefined) {
		return usage('--output goes with --input');
	}

	try {
		const { configs, base } =
			input !== undefined
				? {
						configs: [{ input, ...(output === undefined ? {} : { output }) }],
						base: cwd,
					}
				: await fromFile(config, cwd);
		let stale = 0;
		for (const one of configs) {
			stale += await generateOne(one, {
				base,
				cwd,
				check: values.check === true,
				lint: values.lint === true,
				out,
				err,
			});
		}
		return stale > 0 ? 1 : 0;
	} catch (error) {
		if (!(error instanceof CodegenError)) throw error;
		// One line per diagnostic, warnings included, not the message: that one
		// speaks of "the OpenAPI document", which a config error is not about.
		for (const d of error.diagnostics) err(formatDiagnostic(d, cwd));
		return 1;
	}
}

async function fromFile(
	path: string | undefined,
	cwd: string,
): Promise<{ configs: CodegenConfig[]; base: string }> {
	const { file, configs } = await loadConfig(path, cwd);
	return { configs, base: dirname(file) };
}

/** Generates one spec, and returns how many files `--check` found stale. */
async function generateOne(
	config: CodegenConfig,
	{
		base,
		cwd,
		check,
		lint,
		out,
		err,
	}: {
		base: string;
		cwd: string;
		check: boolean;
		/** `--lint`: lint with the config's own Redocly config, or the default one. */
		lint: boolean;
		out: (line: string) => void;
		err: (line: string) => void;
	},
): Promise<number> {
	const linted = lint && !config.lint ? { ...config, lint: true } : config;
	const result = await generate({ ...linted, check }, { cwd: base });
	for (const warning of result.warnings) err(formatDiagnostic(warning, cwd));
	const shown = (path: string) => relative(cwd, resolve(base, path)) || '.';
	const where = `${shown(config.input)} → ${shown(config.output ?? DEFAULT_OUTPUT)}`;
	if (!check) {
		out(
			`${where}: ${result.written.length} written, ${result.unchanged.length} unchanged`,
		);
		return 0;
	}
	if (result.drifted.length === 0) {
		out(`${where}: up to date`);
		return 0;
	}
	out(`${where}: out of date, run nxgt-openapi generate`);
	for (const file of result.drifted) out(`  ${relative(cwd, file)}`);
	return result.drifted.length;
}
