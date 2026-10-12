/**
 * The intermediate representation: what the spec means, with every `$ref`
 * resolved and every JSON Schema spelling reduced to one shape. The type
 * emitter and the Zod emitter both read this and nothing else — which is what
 * keeps a generated type and its validator from disagreeing.
 *
 * The schema nodes are in `./schema`, the operations in `./operation`.
 */
import type { Diagnostic } from '../../errors';
import type { OperationIR } from './operation';
import type { Alias, NamedSchema } from './schema';

export * from './operation';
export * from './schema';

export interface ApiIR {
	/** The `openapi` field as written. */
	openapi: string;
	version: '3.1' | '3.2';
	title?: string | undefined;
	apiVersion?: string | undefined;
	/** Dependencies before dependents; members of a cycle are marked `recursive`. */
	schemas: NamedSchema[];
	aliases: Alias[];
	operations: OperationIR[];
	warnings: Diagnostic[];
}
