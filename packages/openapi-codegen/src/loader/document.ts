import { dirname, resolve } from 'node:path';
import { CodegenError, type Diagnostic, type Diagnostics } from '../errors';
import { type FileSystem, nodeFileSystem } from './fs';
import { child, type Location } from './location';
import { Resolver } from './resolver';

export type OpenApiVersion = '3.1' | '3.2';

export interface LoadOptions {
	/** Defaults to the real disk. */
	fs?: FileSystem;
	/** What a relative entry path is resolved against. Defaults to `process.cwd()`. */
	cwd?: string;
}

export interface LoadedDocument {
	entry: Location;
	/** The `openapi` field as written, e.g. `3.2.0`. */
	openapi: string;
	version: OpenApiVersion;
	document: Record<string, unknown>;
	/** Synchronous from here on: every reachable file is loaded. */
	resolver: Resolver;
	warnings: Diagnostic[];
}

const SUPPORTED = /^3\.([12])\.\d+(?:-[\w.]+)?$/;

/**
 * Loads a spec — one file, or a root that `$ref`s into many — and checks every
 * `$ref` reachable from it. Throws one `CodegenError` listing every problem.
 */
export async function loadDocument(
	path: string,
	options: LoadOptions = {},
): Promise<LoadedDocument> {
	const resolver = new Resolver(options.fs ?? nodeFileSystem);
	const absolute = resolve(options.cwd ?? process.cwd(), path);
	const entry = await resolver.load(absolute);
	const baseDir = dirname(entry?.file ?? absolute);
	if (!entry) throw new CodegenError(resolver.diagnostics.list, baseDir);

	const document = resolver.get(entry) as Record<string, unknown>;
	// Gate before crawling: a Swagger 2.0 file would otherwise bury the one
	// error that matters under a hundred about refs it spells differently.
	const version = checkVersion(document, entry, resolver.diagnostics);
	if (version) await resolver.crawl(entry);
	if (!version || resolver.diagnostics.hasErrors) {
		throw new CodegenError(resolver.diagnostics.list, baseDir);
	}

	return {
		entry,
		openapi: document.openapi as string,
		version,
		document,
		resolver,
		warnings: resolver.diagnostics.warnings,
	};
}

function checkVersion(
	document: Record<string, unknown>,
	at: Location,
	diagnostics: Diagnostics,
): OpenApiVersion | undefined {
	const { openapi, swagger } = document;
	if (typeof openapi === 'string') {
		const match = SUPPORTED.exec(openapi);
		if (match) return `3.${match[1]}` as OpenApiVersion;
		diagnostics.error(
			'unsupported_version',
			`OpenAPI ${openapi} is not supported; write the document in OpenAPI 3.1 or 3.2`,
			child(at, 'openapi'),
		);
		return undefined;
	}
	if (swagger !== undefined) {
		diagnostics.error(
			'unsupported_version',
			`Swagger ${String(swagger)} is not supported; convert the document to OpenAPI 3.1 or 3.2`,
			child(at, 'swagger'),
		);
		return undefined;
	}
	diagnostics.error(
		'missing_version',
		'no `openapi` field — is this the root document of the spec?',
		at,
	);
	return undefined;
}
