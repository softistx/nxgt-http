import { relative } from 'node:path';
import type { Location } from './loader/location';

/**
 * Every problem the generator reports. The codes are stable — tests, tooling
 * and anyone scripting around the CLI match on them, not on the wording.
 */
export type DiagnosticCode =
	| 'file_not_found'
	| 'parse_error'
	| 'invalid_root'
	| 'invalid_ref'
	| 'remote_ref'
	| 'pointer_not_found'
	| 'ref_cycle'
	| 'missing_version'
	| 'unsupported_version'
	| 'invalid_schema'
	| 'invalid_option'
	| 'invalid_config'
	| 'unsupported_keyword'
	| 'legacy_nullable'
	| 'unknown_format'
	| 'not_enforced'
	| 'discriminator_fallback'
	| 'name_collision'
	| 'invalid_operation'
	| 'unsupported_operation'
	| 'unsupported_parameter'
	| 'path_parameter_mismatch'
	| 'missing_operation_id'
	| 'duplicate_operation_id'
	| 'ignored'
	| 'lint_error'
	| 'lint_warning';

export type Severity = 'error' | 'warning';

export interface Diagnostic {
	severity: Severity;
	code: DiagnosticCode;
	message: string;
	/** Absolute path of the file the problem is in. */
	file?: string;
	/** JSON pointer inside `file`; `''` is the document root. */
	pointer?: string;
	/** Where in `file`, 1-based; only a `lint` problem knows. */
	line?: number;
	column?: number;
}

/**
 * `error paths/employees.yaml#/get/responses/200/$ref: … [pointer_not_found]`,
 * or `file:line:column: …` when the line is known.
 */
export function formatDiagnostic(d: Diagnostic, baseDir?: string): string {
	let where = '';
	if (d.file !== undefined) {
		const file = baseDir ? relative(baseDir, d.file) || d.file : d.file;
		where =
			d.line === undefined
				? `${file}#${d.pointer ?? ''}: `
				: `${file}:${d.line}:${d.column ?? 1}: `;
	}
	return `${d.severity} ${where}${d.message} [${d.code}]`;
}

/**
 * Thrown once, with every error found, rather than at the first one: a spec
 * split over forty files is fixed in one pass, not forty runs.
 */
export class CodegenError extends Error {
	readonly diagnostics: readonly Diagnostic[];

	constructor(diagnostics: readonly Diagnostic[], baseDir?: string) {
		const errors = diagnostics.filter((d) => d.severity === 'error');
		super(
			`${errors.length} error(s) in the OpenAPI document:\n` +
				errors.map((d) => `  ${formatDiagnostic(d, baseDir)}`).join('\n'),
		);
		this.name = 'CodegenError';
		this.diagnostics = diagnostics;
	}
}

/** Collects diagnostics while a pass runs; the caller decides when to throw. */
export class Diagnostics {
	readonly list: Diagnostic[] = [];

	error(code: DiagnosticCode, message: string, at?: Location): void {
		this.list.push({ severity: 'error', code, message, ...at });
	}

	warning(code: DiagnosticCode, message: string, at?: Location): void {
		this.list.push({ severity: 'warning', code, message, ...at });
	}

	get hasErrors(): boolean {
		return this.list.some((d) => d.severity === 'error');
	}

	get warnings(): Diagnostic[] {
		return this.list.filter((d) => d.severity === 'warning');
	}
}
