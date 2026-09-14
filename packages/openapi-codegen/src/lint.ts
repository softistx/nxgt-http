/**
 * The `lint` option: Redocly's linter, run over the spec once it has loaded
 * and before anything is built. `@redocly/openapi-core` is an optional peer,
 * imported only then. It lints and nothing more: the loader alone resolves
 * `$ref`s and names schemas, so a Redocly bundle never renames a collision
 * behind the generator's back.
 */
import { dirname, resolve } from 'node:path';
import type { Diagnostic } from './errors';

/** `true`: the `redocly.yaml` beside the spec, or Redocly's defaults. A string: that config file. */
export type Lint = boolean | string;

const failed = (message: string): Diagnostic[] => [
	{ severity: 'error', code: 'invalid_option', message },
];

const firstLine = (error: unknown): string =>
	String(error instanceof Error ? error.message : error).split('\n')[0] ?? '';

/** The package is absent, as opposed to present and broken. */
const notInstalled = (error: unknown): boolean =>
	(error as { code?: unknown } | null)?.code === 'ERR_MODULE_NOT_FOUND' ||
	/Cannot find (module|package)/.test(firstLine(error));

/** Redocly's problems with `input`, as `lint_error` and `lint_warning` diagnostics. */
export async function lintSpec(
	input: string,
	lint: true | string,
	cwd: string,
): Promise<Diagnostic[]> {
	let redocly: typeof import('@redocly/openapi-core');
	try {
		redocly = await import('@redocly/openapi-core');
	} catch (error) {
		return failed(
			notInstalled(error)
				? 'lint needs @redocly/openapi-core: add it to your devDependencies'
				: `lint: @redocly/openapi-core failed to load: ${firstLine(error)}`,
		);
	}
	const configPath =
		lint === true ? redocly.findConfig(dirname(input)) : resolve(cwd, lint);
	let config: Awaited<ReturnType<typeof redocly.loadConfig>>;
	try {
		config = await redocly.loadConfig({ configPath });
	} catch (error) {
		return failed(
			`lint: the Redocly config cannot be loaded: ${firstLine(error)}`,
		);
	}
	let problems: Awaited<ReturnType<typeof redocly.lint>>;
	try {
		problems = await redocly.lint({ ref: input, config });
	} catch (error) {
		return [
			{
				severity: 'error',
				code: 'lint_error',
				message: `Redocly failed on the spec: ${firstLine(error)}`,
				file: input,
			},
		];
	}
	return problems
		.filter((problem) => !problem.ignored)
		.map((problem) => {
			const error = problem.severity === 'error';
			const diagnostic: Diagnostic = {
				severity: error ? 'error' : 'warning',
				code: error ? 'lint_error' : 'lint_warning',
				message: `${problem.message} (${problem.ruleId})`,
			};
			const at = problem.location[0];
			if (at) {
				const { start } = redocly.getLineColLocation(at);
				diagnostic.file = at.source.absoluteRef;
				if (at.pointer !== undefined) {
					diagnostic.pointer = at.pointer.replace(/^#/, '');
				}
				diagnostic.line = start.line;
				diagnostic.column = start.col;
			}
			return diagnostic;
		});
}
