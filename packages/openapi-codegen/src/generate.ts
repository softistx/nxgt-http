import { dirname, join, relative, resolve, sep } from 'node:path';
import { emitFiles, type GeneratedFile } from './emit';
import type { UnknownKeys } from './emit/context';
import { CodegenError, type Diagnostic } from './errors';
import { buildIR, type IROptions } from './ir';
import { loadDocument } from './loader/document';
import type { FileSystem } from './loader/fs';
import { type WriteResult, writeFiles } from './writer/write';

export interface GenerateOptions extends IROptions {
	/** The spec's root document: `openapi.yaml`, or one that `$ref`s the rest. */
	input: string;
	/** The directory the generated files are written to. */
	output: string;
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

const UNKNOWN_KEYS: readonly string[] = ['strip', 'strict', 'loose'];
const EXTENSIONS: readonly string[] = ['', '.js', '.ts'];

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
	const input = resolve(cwd, options.input);
	const output = resolve(cwd, options.output);
	const doc = await loadDocument(input, { fs, cwd });
	const ir = buildIR(doc, options);
	const { files, warnings } = emitFiles(ir, {
		unknownKeys,
		importExtension,
		source: relative(output, input).split(sep).join('/'),
		rootDir: dirname(doc.entry.file),
	});
	return {
		files: files.map((file) => ({ ...file, path: join(output, file.path) })),
		warnings: [...ir.warnings, ...warnings],
	};
}

/**
 * Generates the files and writes those that changed. With `check`, writes
 * nothing and lists in `drifted` the files a run would change.
 */
export async function generate(
	options: GenerateOptions & { check?: boolean },
	context: GenerateContext = {},
): Promise<GenerateResult> {
	const { files, warnings } = await generateFiles(options, context);
	return { ...(await writeFiles(files, { check: options.check })), warnings };
}
