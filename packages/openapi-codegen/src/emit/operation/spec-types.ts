/** The interfaces `operations.ts` types its table with: `OperationSpec`, `ParameterSpec`, `MediaSpec`. */
import { HTTP_METHODS } from '../../ir/types';
import { jsString } from '../printer';

export const SPEC_TYPES = `/** How a server reads a parameter, and how a client writes it. */
export interface ParameterSpec {
	readonly name: string;
	readonly in: 'path' | 'query' | 'header';
	readonly required: boolean;
	/** A query list as \`?a=1&a=2\` (true) or \`?a=1,2\` (false). */
	readonly explode: boolean;
	/** Validated as a list: every value of a repeated query key, or one split on commas. */
	readonly list: boolean;
}

export interface MediaSpec {
	readonly kind: 'json' | 'form' | 'text' | 'binary' | 'sse' | 'jsonl';
	/** Absent for binary content, which is passed through unvalidated, and for a stream. */
	readonly schema?: z.ZodType;
	/** \`sse\`: each event's data, by name: a schema for JSON, \`null\` for text. Absent: any event, as text. */
	readonly events?: { readonly [event: string]: z.ZodType | null };
	/** \`jsonl\`: each item. Absent: any JSON. */
	readonly item?: z.ZodType;
}

/** An operation of the table; \`Client\` is its entry of \`ClientOperations\`. */
export interface OperationSpec<Client = unknown> {
	readonly method: ${HTTP_METHODS.map(jsString).join(' | ')};
	readonly path: string;
	readonly honoPath: string;
	readonly tags: readonly string[];
	readonly parameters: readonly ParameterSpec[];
	/** Validates the path parameters, each read as a string. */
	readonly param: z.ZodType;
	/** Validates the query: a string per parameter, or every value of a list. */
	readonly query: z.ZodType;
	/** Validates the headers, keyed by lowercased name. */
	readonly header: z.ZodType;
	readonly body?: {
		readonly required: boolean;
		readonly content: { readonly [mediaType: string]: MediaSpec };
	};
	readonly responses: {
		readonly [status: number]: { readonly [mediaType: string]: MediaSpec };
	};
	/** Never set: carries \`Client\`, so \`createOpenApiClient(http, operations)\` reads the spec's types off the table. */
	readonly '~client'?: Client;
}`;
