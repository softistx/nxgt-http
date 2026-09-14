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

/** Redocly's problems with `input`, as `lint_error` and `lint_warning` diagnostics. */
export async function lintSpec(
	input: string,
	lint: true | string,
	cwd: string,
): Promise<Diagnostic[]> {
	let redocly: typeof import('@redocly/openapi-core');
	try {
		redocly = await import('@redocly/openapi-core');
	} catch {
		return failed(
			'lint needs @redocly/openapi-core: add it to your devDependencies',
		);
	}
	const configPath =
		lint === true ? redocly.findConfig(dirname(input)) : resolve(cwd, lint);
	let config: Awaited<ReturnType<typeof redocly.loadConfig>>;
	try {
		config = await redocly.loadConfig({ configPath });
	} catch (error) {
		const [reason] = String((error as Error).message).split('\n');
		return failed(`lint: the Redocly config cannot be loaded: ${reason}`);
	}
	const problems = await redocly.lint({ ref: input, config });
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
