/**
 * Every operation under `paths`, with its parameters merged from the path
 * item, its bodies and responses resolved, and inline shapes named after it.
 *
 * Each part lives under `operation/`, one file per role, a plain function
 * taking the part of `OperationState` it reads; this file only puts them in
 * order.
 */
import type { Diagnostics } from '../errors';
import type { LoadedDocument } from '../loader/document';
import { checkParameters } from './operation/check-parameters';
import { pathOperations } from './operation/paths';
import type { OperationState } from './operation/state';
import type { SchemaBuilder } from './schemas';
import type { OperationIR } from './types';

export class OperationBuilder {
	readonly #state: OperationState;

	constructor(
		doc: LoadedDocument,
		schemas: SchemaBuilder,
		diagnostics: Diagnostics,
	) {
		this.#state = {
			doc,
			resolver: doc.resolver,
			schemas,
			diagnostics,
			ids: new Map(),
		};
	}

	/** Every operation under `paths`, in the order the document lists them. */
	build(): OperationIR[] {
		return pathOperations(this.#state);
	}

	/** Once every schema is built: can each parameter be read from a URL, a header or a cookie? */
	checkParameters(operations: readonly OperationIR[]): void {
		checkParameters(this.#state, operations);
	}
}
