/** An operation, as the IR holds it: its method, its parameters, its body and its replies. */
import type { Location } from '../../loader/location';
import type { SchemaNode } from './schema';

export const HTTP_METHODS = [
	'get',
	'put',
	'post',
	'delete',
	'options',
	'head',
	'patch',
	'trace',
	'query',
] as const;

export type HttpMethod = (typeof HTTP_METHODS)[number];

/** Where a parameter is read from. A `cookie` one is kept apart, in `OperationIR.cookies`. */
export type ParamLocation = 'path' | 'query' | 'header' | 'cookie';

export interface ParamIR {
	name: string;
	in: ParamLocation;
	required: boolean;
	/** Query lists as `?a=1&a=2` (true) or `?a=1,2` (false). */
	explode: boolean;
	schema: SchemaNode;
	description?: string | undefined;
	deprecated?: boolean | undefined;
	location: Location;
}

/**
 * `sse` and `jsonl` are replies read an item at a time, as OpenAPI 3.2's
 * `itemSchema` describes them: server-sent events, and JSON Lines, NDJSON
 * or JSON text sequences.
 */
export type MediaKind = 'json' | 'form' | 'text' | 'binary' | 'sse' | 'jsonl';

/** An event a stream of server-sent events declares. */
export interface EventIR {
	/** Its `event` field: `message` for an event sent without one. */
	name: string;
	/** Its data as JSON, from `contentSchema`; absent when the data is text. */
	data?: SchemaNode;
}

export interface MediaIR {
	mediaType: string;
	kind: MediaKind;
	/** Absent for binary content, which is passed through unvalidated, and for a stream. */
	schema?: SchemaNode | undefined;
	/** `sse`: the events its `itemSchema` declares. Absent when it declares none: any event, as text. */
	events?: EventIR[];
	/** `jsonl`: each item, from `itemSchema`. Absent when it has none: any JSON. */
	item?: SchemaNode;
}

export interface BodyIR {
	required: boolean;
	description?: string | undefined;
	content: MediaIR[];
}

export interface ResponseIR {
	status: number;
	description?: string | undefined;
	content: MediaIR[];
	location: Location;
}

export interface OperationIR {
	operationId: string;
	/** `operationId` in PascalCase, the stem of every name generated for it. */
	name: string;
	method: HttpMethod;
	/** As the spec writes it: `/employees/{id}`. */
	path: string;
	/** As Hono routes it: `/employees/:id`. */
	honoPath: string;
	summary?: string | undefined;
	description?: string | undefined;
	deprecated: boolean;
	/**
	 * A `POST` the spec marks `x-nxgt-method: query`: a `QUERY`, safe, its
	 * criteria in the body, sent as a `POST` until `QUERY` is one everywhere.
	 */
	queryMethod: boolean;
	tags: string[];
	/** Its path, query and header parameters. */
	parameters: ParamIR[];
	/**
	 * Its cookie parameters, kept apart from `parameters`: only `alxia.ts`
	 * validates them. The client files leave them out, as a client does not
	 * send cookies, and `hono.ts` does not validate them.
	 */
	cookies: ParamIR[];
	body?: BodyIR | undefined;
	responses: ResponseIR[];
	location: Location;
}
