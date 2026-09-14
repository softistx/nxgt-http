/**
 * The intermediate representation: what the spec means, with every `$ref`
 * resolved and every JSON Schema spelling reduced to one shape. The type
 * emitter and the Zod emitter both read this and nothing else — which is what
 * keeps a generated type and its validator from disagreeing.
 */
import type { Diagnostic } from '../errors';
import type { Location } from '../loader/location';

export type Scalar = string | number | boolean | null;

export type StringFormat =
	| 'date-time'
	| 'date'
	| 'time'
	| 'duration'
	| 'email'
	| 'uri'
	| 'uuid'
	| 'ipv4'
	| 'ipv6'
	/** base64-encoded bytes (`format: byte`, `contentEncoding: base64`). */
	| 'byte';

export type NumberFormat = 'int32' | 'int64' | 'float' | 'double';

export interface Annotations {
	nullable?: boolean;
	description?: string;
	deprecated?: boolean;
	readOnly?: boolean;
	writeOnly?: boolean;
	/** Boxed, because `null` is a real default and `undefined` is none. */
	default?: { value: unknown };
}

/** A named schema, by the id of the node it names. */
export interface RefNode extends Annotations {
	kind: 'ref';
	target: string;
	/** Under `unevaluatedProperties: false`: the target must refuse the keys it does not declare. */
	sealed?: boolean;
}

export interface StringNode extends Annotations {
	kind: 'string';
	format?: StringFormat;
	minLength?: number;
	maxLength?: number;
	pattern?: string;
}

export interface NumberNode extends Annotations {
	kind: 'number';
	integer: boolean;
	format?: NumberFormat;
	minimum?: number;
	maximum?: number;
	exclusiveMinimum?: number;
	exclusiveMaximum?: number;
	multipleOf?: number;
}

export interface SimpleNode extends Annotations {
	/** `binary` is raw content — a file upload, an octet stream — never JSON. */
	kind: 'boolean' | 'null' | 'binary' | 'unknown' | 'never';
}

export interface LiteralNode extends Annotations {
	kind: 'literal';
	values: Scalar[];
	/** A member name per value, from `x-enum-varnames` or `x-enumNames`. */
	names?: string[];
}

export interface ArrayNode extends Annotations {
	kind: 'array';
	items: SchemaNode;
	minItems?: number;
	maxItems?: number;
}

/**
 * What an object does with keys it does not declare. `default` is the
 * spec's silence, and the generator's `unknownKeys` option decides it.
 */
export type Additional =
	| 'default'
	| 'strict'
	| 'loose'
	| { schema: SchemaNode };

export interface Property {
	name: string;
	required: boolean;
	schema: SchemaNode;
}

export interface ObjectNode extends Annotations {
	kind: 'object';
	properties: Property[];
	additional: Additional;
	/** Named object schemas this one builds on — `allOf` over objects. */
	extends: string[];
	/** Properties of a parent that this schema makes required. */
	requires?: string[];
}

export interface RecordNode extends Annotations {
	kind: 'record';
	values: SchemaNode;
}

export interface UnionNode extends Annotations {
	kind: 'union';
	variants: SchemaNode[];
	/** `oneOf` rather than `anyOf`. Recorded, not enforced. */
	exclusive: boolean;
	/** Set only when every variant is an object with a constant for it. */
	discriminator?: string;
	/** `unevaluatedProperties: false`: every variant must refuse the keys it does not declare. */
	sealed?: boolean;
}

export interface IntersectionNode extends Annotations {
	kind: 'intersection';
	members: SchemaNode[];
	/** `unevaluatedProperties: false`: every member must refuse the keys no member declares. */
	sealed?: boolean;
}

export type SchemaNode =
	| RefNode
	| StringNode
	| NumberNode
	| SimpleNode
	| LiteralNode
	| ArrayNode
	| ObjectNode
	| RecordNode
	| UnionNode
	| IntersectionNode;

export interface NamedSchema {
	/** The canonical location id of the node it names. */
	id: string;
	name: string;
	location: Location;
	/** A `components.schemas` key, a `$ref`'d file, or a body or response written inline. */
	source: 'component' | 'ref' | 'inline';
	node: SchemaNode;
	/** Part of a reference cycle, so its validator must be built lazily. */
	recursive: boolean;
}

/** A second `components.schemas` key standing for a schema already named. */
export interface Alias {
	name: string;
	target: string;
	location: Location;
}

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

export type ParamLocation = 'path' | 'query' | 'header';

export interface ParamIR {
	name: string;
	in: ParamLocation;
	required: boolean;
	/** Query lists as `?a=1&a=2` (true) or `?a=1,2` (false). */
	explode: boolean;
	schema: SchemaNode;
	description?: string;
	deprecated?: boolean;
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
	schema?: SchemaNode;
	/** `sse`: the events its `itemSchema` declares. Absent when it declares none: any event, as text. */
	events?: EventIR[];
	/** `jsonl`: each item, from `itemSchema`. Absent when it has none: any JSON. */
	item?: SchemaNode;
}

export interface BodyIR {
	required: boolean;
	description?: string;
	content: MediaIR[];
}

export interface ResponseIR {
	status: number;
	description?: string;
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
	summary?: string;
	description?: string;
	deprecated: boolean;
	tags: string[];
	parameters: ParamIR[];
	body?: BodyIR;
	responses: ResponseIR[];
	location: Location;
}

export interface ApiIR {
	/** The `openapi` field as written. */
	openapi: string;
	version: '3.1' | '3.2';
	title?: string;
	apiVersion?: string;
	/** Dependencies before dependents; members of a cycle are marked `recursive`. */
	schemas: NamedSchema[];
	aliases: Alias[];
	operations: OperationIR[];
	warnings: Diagnostic[];
}
