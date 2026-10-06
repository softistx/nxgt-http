import type { Diagnostics } from '../../errors';
import type { LoadedDocument } from '../../loader/document';
import type { Location } from '../../loader/location';
import type { Resolver } from '../../loader/resolver';
import type { SchemaBuilder } from '../schemas';

/**
 * What `OperationBuilder` holds, handed to the parts under `operation/` as
 * an explicit argument. Each part takes only what it reads, as a `Pick` of it.
 */
export interface OperationState {
	readonly doc: LoadedDocument;
	/** The document's resolver: `doc.resolver`. */
	readonly resolver: Resolver;
	readonly schemas: SchemaBuilder;
	readonly diagnostics: Diagnostics;
	/** Every `operationId` claimed so far, and where. */
	readonly ids: Map<string, Location>;
}
