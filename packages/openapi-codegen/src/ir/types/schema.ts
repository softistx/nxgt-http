/** A schema, as the IR holds it: one node kind per shape, every `$ref` a `ref` node. */
import type { Location } from '../../loader/location';

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
	description?: string | undefined;
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
	/** The `x-nxgt-scalar` of a scalar of `@nxgt/typespec`, such as `IBAN`. */
	scalar?: string;
	minLength?: number;
	maxLength?: number;
	pattern?: string;
}

export interface NumberNode extends Annotations {
	kind: 'number';
	integer: boolean;
	/** The `x-nxgt-scalar` of a scalar of `@nxgt/typespec`, such as `Port`. */
	scalar?: string;
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
