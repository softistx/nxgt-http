/** The checks of `generateFiles`' options, and their defaults. */
import type { Dates, Enums, Scalars, UnknownKeys } from './emit/options';
import { CodegenError } from './errors';
import type { GenerateOptions } from './generate';
import type { Lint } from './lint';

const UNKNOWN_KEYS: readonly string[] = ['strip', 'strict', 'loose'];
const EXTENSIONS: readonly string[] = ['', '.js', '.ts'];
const ENUMS: readonly string[] = ['object', 'union'];
const DATES: readonly string[] = ['string', 'date'];
const SCALARS: readonly string[] = ['pattern', 'exact'];
const READ_ONLY: readonly string[] = ['omit', 'keep'];

const invalid = (message: string): CodegenError =>
	new CodegenError([{ severity: 'error', code: 'invalid_option', message }]);

export interface ValidOptions {
	unknownKeys: UnknownKeys;
	importExtension: '' | '.js' | '.ts';
	enums: Enums;
	hono: boolean;
	alxia: boolean;
	dates: Dates;
	scalars: Scalars;
	readOnly: 'omit' | 'keep';
	lint: Lint;
	validationErrors: boolean;
}

/**
 * The options with their defaults, or a `CodegenError` (`invalid_option`) for
 * a value that is none of the choices. `hasFs`: the spec is read through
 * `fs`, which `lint` cannot be.
 */
export function validateOptions(
	options: GenerateOptions,
	hasFs: boolean,
): ValidOptions {
	const unknownKeys = options.unknownKeys ?? 'strip';
	if (!UNKNOWN_KEYS.includes(unknownKeys)) {
		throw invalid(
			`unknownKeys must be strip, strict or loose, not ${unknownKeys}`,
		);
	}
	const importExtension = options.importExtension ?? '';
	if (!EXTENSIONS.includes(importExtension)) {
		throw invalid(
			`importExtension must be '', '.js' or '.ts', not ${importExtension}`,
		);
	}
	const enums = options.enums ?? 'object';
	if (!ENUMS.includes(enums)) {
		throw invalid(`enums must be object or union, not ${enums}`);
	}
	const hono = options.hono ?? false;
	if (typeof hono !== 'boolean') {
		throw invalid(`hono must be true or false, not ${String(hono)}`);
	}
	const alxia = options.alxia ?? false;
	if (typeof alxia !== 'boolean') {
		throw invalid(`alxia must be true or false, not ${String(alxia)}`);
	}
	const dates = options.dates ?? 'string';
	if (!DATES.includes(dates)) {
		throw invalid(`dates must be string or date, not ${dates}`);
	}
	const scalars = options.scalars ?? 'pattern';
	if (!SCALARS.includes(scalars)) {
		throw invalid(`scalars must be pattern or exact, not ${scalars}`);
	}
	const readOnly = options.readOnly ?? 'omit';
	if (!READ_ONLY.includes(readOnly)) {
		throw invalid(`readOnly must be omit or keep, not ${readOnly}`);
	}
	const lint = options.lint ?? false;
	if (typeof lint !== 'boolean' && (typeof lint !== 'string' || lint === '')) {
		throw invalid(
			`lint must be true, false or a Redocly config file, not ${String(lint)}`,
		);
	}
	const validationErrors = options.validationErrors ?? true;
	if (typeof validationErrors !== 'boolean') {
		throw invalid(
			`validationErrors must be true or false, not ${String(validationErrors)}`,
		);
	}
	if (lint !== false && hasFs) {
		throw invalid('lint reads the spec from disk: it cannot be used with fs');
	}
	return {
		unknownKeys,
		importExtension,
		enums,
		hono,
		alxia,
		dates,
		scalars,
		readOnly,
		lint,
		validationErrors,
	};
}
