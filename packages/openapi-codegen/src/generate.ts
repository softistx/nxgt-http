import { dirname, join, relative, resolve, sep } from 'node:path';
import { emitFiles, FILE_NAMES, type GeneratedFile } from './emit';
import type { Dates, Enums, UnknownKeys } from './emit/context';
import { CodegenError, type Diagnostic } from './errors';
import { buildIR, type IROptions } from './ir';
import { type Lint, lintSpec } from './lint';
import { loadDocument } from './loader/document';
import type { FileSystem } from './loader/fs';
import { type WriteResult, writeFiles } from './writer/write';

export interface GenerateOptions extends IROptions {
	/** The spec's root document: `openapi.yaml`, or one that `$ref`s the rest. */
	input: string;
	/** The directory the generated files are written to. Default `generated/openapi`. */
	output?: string;
	/**
	 * What an object does with keys it does not declare, where the spec does
	 * not say with `additionalProperties`. Default `strip`.
	 */
	unknownKeys?: UnknownKeys;
	/**
	 * Appended to imports between generated files. The default `.js` resolves
	 * under every `moduleResolution`; `''` suits bundlers only, `.ts` needs
	 * `allowImportingTsExtensions`.
	 */
	importExtension?: '' | '.js' | '.ts';
	/**
	 * A named `enum` of strings or numbers: an `as const` object that
	 * `z.enum()` reuses (`object`, the default), or a plain union (`union`).
	 */
	enums?: Enums;
	/**
	 * Also emit `hono.ts`: typed routes for a Hono app. It imports `hono`
	 * and `@nxgt/openapi-codegen/hono`, so both become runtime dependencies.
	 */
	hono?: boolean;
	/**
	 * A `date-time`: validated and kept as its string (`string`, the default),
	 * or decoded to a `Date` by a `z.codec` (`date`). `format: date` stays a
	 * string either way: a day is not an instant.
	 */
	dates?: Dates;
	/**
	 * Lint the spec with Redocly before generating: `true` uses the
	 * `redocly.yaml` beside `input`, or Redocly's defaults; a string names the
	 * config file. Needs the optional peer `@redocly/openapi-core`. A lint
	 * error stops the run; a lint warning comes back with the others.
	 */
	lint?: Lint;
}

export interface GenerateContext {
	/** Relative paths in the options resolve against it. Default `process.cwd()`. */
	cwd?: string;
	fs?: FileSystem;
}

export interface GenerateResult extends WriteResult {
	/** What the spec uses that the generated code does not enforce, or ignores. */
	warnings: Diagnostic[];
}

/** Where the files go when no `output` is given, relative to `cwd`. */
export const DEFAULT_OUTPUT = 'generated/openapi';

const UNKNOWN_KEYS: readonly string[] = ['strip', 'strict', 'loose'];
const EXTENSIONS: readonly string[] = ['', '.js', '.ts'];
const ENUMS: readonly string[] = ['object', 'union'];
const DATES: readonly string[] = ['string', 'date'];

const invalid = (message: string): CodegenError =>
	new CodegenError([{ severity: 'error', code: 'invalid_option', message }]);

/**
 * The generated files, in memory, with absolute paths. Throws a
 * `CodegenError` listing everything the spec asks for that cannot be
 * generated faithfully.
 */
export async function generateFiles(
	options: GenerateOptions,
	{ cwd = process.cwd(), fs }: GenerateContext = {},
): Promise<{ files: GeneratedFile[]; warnings: Diagnostic[] }> {
	const unknownKeys = options.unknownKeys ?? 'strip';
	if (!UNKNOWN_KEYS.includes(unknownKeys)) {
		throw invalid(
			`unknownKeys must be strip, strict or loose, not ${unknownKeys}`,
		);
	}
	const importExtension = options.importExtension ?? '.js';
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
	const dates = options.dates ?? 'string';
	if (!DATES.includes(dates)) {
		throw invalid(`dates must be string or date, not ${dates}`);
	}
	const lint = options.lint ?? false;
	if (typeof lint !== 'boolean' && (typeof lint !== 'string' || lint === '')) {
		throw invalid(
			`lint must be true, false or a Redocly config file, not ${String(lint)}`,
		);
	}
	if (lint !== false && fs !== undefined) {
		throw invalid('lint reads the spec from disk: it cannot be used with fs');
	}
	const input = resolve(cwd, options.input);
	const output = resolve(cwd, options.output ?? DEFAULT_OUTPUT);
	const doc = await loadDocument(input, { fs, cwd });
	const linted = lint === false ? [] : await lintSpec(input, lint, cwd);
	if (linted.some((d) => d.severity === 'error')) {
		throw new CodegenError(linted, dirname(input));
	}
	const ir = buildIR(doc, options);
	const { files, warnings } = emitFiles(ir, {
		unknownKeys,
		enums,
		importExtension,
		hono,
		dates,
		source: relative(output, input).split(sep).join('/'),
		rootDir: dirname(doc.entry.file),
	});
	return {
		files: files.map((file) => ({ ...file, path: join(output, file.path) })),
		warnings: [...linted, ...ir.warnings, ...warnings],
	};
}

/**
 * Generates the files and writes those that changed, and deletes a file an
 * earlier run generated that this one does not (`hono.ts` once `hono` is
 * off). With `check`, writes nothing and lists in `drifted` the files a run
 * would change.
 */
export async function generate(
	options: GenerateOptions & { check?: boolean },
	context: GenerateContext = {},
): Promise<GenerateResult> {
	const { files, warnings } = await generateFiles(options, context);
	const output = resolve(
		context.cwd ?? process.cwd(),
		options.output ?? DEFAULT_OUTPUT,
	);
	const retired = FILE_NAMES.map((name) => join(output, name));
	return {
		...(await writeFiles(files, { check: options.check, retired })),
		warnings,
	};
}
