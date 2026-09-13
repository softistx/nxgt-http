import { dirname } from 'node:path';
import { CodegenError, Diagnostics } from '../errors';
import type { LoadedDocument } from '../loader/document';
import { child } from '../loader/location';
import { asString, isObject } from '../util';
import { OperationBuilder } from './operations';
import { SchemaBuilder } from './schemas';
import type { ApiIR } from './types';

export interface IROptions {
	/**
	 * Renames schemas, keyed by file relative to the root document, plus
	 * `#pointer` when the schema is not the whole file:
	 * `{ 'components/schemas/Error.yaml': 'ApiError' }`. The way out of a
	 * name collision.
	 */
	names?: Record<string, string>;
	/** OpenAPI 3.0's `nullable: true`: read as `type: [T, 'null']` with a warning, or refused. */
	legacyNullable?: 'warn' | 'error';
}

/**
 * What a loaded spec means: every named schema, in the order it can be
 * emitted, and every operation. Throws one `CodegenError` listing everything
 * the generator cannot express faithfully — it never approximates silently.
 */
export function buildIR(doc: LoadedDocument, options: IROptions = {}): ApiIR {
	const rootDir = dirname(doc.entry.file);
	const diagnostics = new Diagnostics();
	diagnostics.list.push(...doc.warnings);
	const schemas = new SchemaBuilder(doc.resolver, diagnostics, {
		rootDir,
		names: options.names ?? {},
		legacyNullable: options.legacyNullable ?? 'warn',
	});

	// Components first, so a component's key wins the name of what it names.
	const components = isObject(doc.document.components)
		? doc.document.components.schemas
		: undefined;
	if (isObject(components)) {
		for (const [key, value] of Object.entries(components)) {
			schemas.component(
				key,
				value,
				child(doc.entry, 'components', 'schemas', key),
			);
		}
	}

	const builder = new OperationBuilder(doc, schemas, diagnostics);
	const operations = builder.build();
	schemas.drain();
	builder.checkParameters(operations);
	const named = schemas.finalize();

	if (
		isObject(doc.document.webhooks) &&
		Object.keys(doc.document.webhooks).length > 0
	) {
		diagnostics.warning(
			'ignored',
			'webhooks are not generated',
			child(doc.entry, 'webhooks'),
		);
	}
	if (diagnostics.hasErrors) throw new CodegenError(diagnostics.list, rootDir);

	const info = isObject(doc.document.info) ? doc.document.info : {};
	return {
		openapi: doc.openapi,
		version: doc.version,
		title: asString(info.title),
		apiVersion: asString(info.version),
		schemas: named,
		aliases: schemas.aliases,
		operations,
		warnings: diagnostics.warnings,
	};
}
