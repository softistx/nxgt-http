import { relative } from 'node:path';
import type { Diagnostics } from '../errors';
import { child, type Location, locationId } from '../loader/location';
import type { Resolved, Resolver } from '../loader/resolver';
import { asNumber, asString, isObject } from '../util';
import { refsOf, stronglyConnected } from './graph';
import { nameFromLocation, pascalCase } from './naming';
import type {
	Additional,
	Alias,
	ArrayNode,
	NamedSchema,
	NumberFormat,
	NumberNode,
	ObjectNode,
	Property,
	Scalar,
	SchemaNode,
	StringFormat,
	StringNode,
	UnionNode,
} from './types';

/** Keywords that describe a schema without changing what it accepts. */
const ANNOTATION_KEYS = new Set([
	'title',
	'description',
	'deprecated',
	'readOnly',
	'writeOnly',
	'default',
	'example',
	'examples',
	'$comment',
	'externalDocs',
	'xml',
	'$schema',
	'$id',
	'$anchor',
	'nullable',
]);

/** JSON Schema that v1 cannot express faithfully: refused, never approximated. */
const UNSUPPORTED_KEYWORDS = [
	'not',
	'if',
	'then',
	'else',
	'dependentSchemas',
	'dependentRequired',
	'patternProperties',
	'propertyNames',
	'unevaluatedItems',
	'prefixItems',
	'contains',
	'minContains',
	'maxContains',
	'$dynamicRef',
	'$dynamicAnchor',
	'$recursiveRef',
];

const JSON_TYPES = new Set([
	'string',
	'number',
	'integer',
	'boolean',
	'null',
	'array',
	'object',
]);

const STRING_FORMATS = new Set([
	'date-time',
	'date',
	'time',
	'duration',
	'email',
	'uri',
	'uuid',
	'ipv4',
	'ipv6',
]);

const NUMBER_FORMATS = new Set(['int32', 'int64', 'float', 'double']);

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

/** Words a `names` override cannot be: `export interface default` does not compile. */
const RESERVED = new Set([
	...['break', 'case', 'catch', 'class', 'const', 'continue', 'debugger'],
	...['default', 'delete', 'do', 'else', 'enum', 'export', 'extends'],
	...['false', 'finally', 'for', 'function', 'if', 'import', 'in'],
	...['instanceof', 'new', 'null', 'return', 'super', 'switch', 'this'],
	...['throw', 'true', 'try', 'typeof', 'var', 'void', 'while', 'with'],
	...['implements', 'interface', 'let', 'package', 'private', 'protected'],
	...['public', 'static', 'yield', 'await', 'arguments', 'eval'],
	// Predefined types TypeScript refuses as the name of an interface.
	...['any', 'bigint', 'boolean', 'never', 'number', 'object', 'string'],
	...['symbol', 'undefined', 'unknown'],
]);

/** Shapes worth a name when a body or a response writes them inline. */
const NAMED_KINDS = new Set<SchemaNode['kind']>([
	'object',
	'union',
	'intersection',
	'record',
]);

const without = (
	object: Record<string, unknown>,
	drop: (key: string) => boolean,
): Record<string, unknown> =>
	Object.fromEntries(Object.entries(object).filter(([key]) => !drop(key)));

/** Whether `pattern` compiles, as Unicode or, failing that, in the legacy syntax. */
const isRegExp = (pattern: string): boolean =>
	['u', ''].some((flags) => {
		try {
			return new RegExp(pattern, flags) instanceof RegExp;
		} catch {
			return false;
		}
	});

const strings = (value: unknown): string[] =>
	Array.isArray(value)
		? value.filter((item): item is string => typeof item === 'string')
		: [];

/** Rewrites `target` in place, keeping what it was annotated with. */
function replaceNode(target: SchemaNode, next: SchemaNode): void {
	const { nullable, description, deprecated, readOnly, writeOnly } = target;
	const kept = Object.fromEntries(
		Object.entries({
			nullable,
			description,
			deprecated,
			readOnly,
			writeOnly,
			default: target.default,
		}).filter(([, value]) => value !== undefined),
	);
	const record = target as unknown as Record<string, unknown>;
	for (const key of Object.keys(record)) delete record[key];
	Object.assign(target, next, kept);
}

/** What may sit next to `oneOf` or `anyOf`, applied on top of the variant that matches. */
const BESIDE_UNION = new Set([
	'properties',
	'additionalProperties',
	'items',
	'required',
	'minProperties',
	'maxProperties',
]);

const ANNOTATED = [
	'description',
	'deprecated',
	'readOnly',
	'writeOnly',
	'default',
] as const;

/** `target`, given the annotations `from` has and it lacks. */
function annotated(target: SchemaNode, from: SchemaNode): SchemaNode {
	const copy = { ...target };
	for (const key of ANNOTATED) {
		if (copy[key] === undefined && from[key] !== undefined) {
			Object.assign(copy, { [key]: from[key] });
		}
	}
	return copy;
}

/** Only a `kind`, and annotations: what `{ type: string }` reads as. */

/**
 * What a value must be to hold both `a` and `b`, as `allOf` asks: one
 * scalar with the constraints of both when none clash, else their
 * intersection. Either way it keeps the annotations of both, a `default`
 * included, so a restated property still gets its parent's default.
 */
function meet(a: SchemaNode, b: SchemaNode): SchemaNode {
	if (b.kind === 'unknown') return annotated(a, b);
	if (a.kind === 'unknown') return annotated(b, a);
	if (JSON.stringify(a) === JSON.stringify(b)) return a;
	return (
		merged(a, b) ??
		annotated(annotated({ kind: 'intersection', members: [a, b] }, a), b)
	);
}

const SCALARS = new Set(['string', 'number', 'boolean', 'null', 'binary']);

/**
 * `a` and `b`, scalars of one kind, as one node: every constraint of both,
 * `integer` if either says so, and `null` only when both let it through.
 * Nothing when they set one constraint to two values.
 */
function merged(a: SchemaNode, b: SchemaNode): SchemaNode | undefined {
	if (a.kind !== b.kind || !SCALARS.has(a.kind)) return undefined;
	const out: Record<string, unknown> = { ...a };
	for (const [key, value] of Object.entries(b)) {
		if (key === 'nullable' || (ANNOTATED as readonly string[]).includes(key)) {
			continue;
		}
		const mine = out[key];
		if (key === 'integer') out[key] = Boolean(mine) || Boolean(value);
		else if (mine === undefined) out[key] = value;
		else if (JSON.stringify(mine) !== JSON.stringify(value)) return undefined;
	}
	if (!(a.nullable && b.nullable)) delete out.nullable;
	return annotated(out as unknown as SchemaNode, b);
}

export interface SchemaBuilderOptions {
	/** The directory of the root document; names and messages are relative to it. */
	rootDir: string;
	names: Readonly<Record<string, string>>;
	legacyNullable: 'warn' | 'error';
}

/**
 * Turns JSON Schema into `SchemaNode`s and gives every schema that needs one
 * a name.
 *
 * A schema is named when it is a `components.schemas` entry, the target of a
 * `$ref`, or a body or response written inline; everything else stays inline
 * where it is used. A `$ref` is never inlined: it becomes a `ref` node, which
 * is what makes recursion and shared fragments one schema each.
 *
 * Named schemas are normalized lazily from a queue, so a `$ref` to something
 * not seen yet costs nothing until `drain()`.
 */
export class SchemaBuilder {
	/** Every named schema, by the id of the node it names. */
	readonly named = new Map<string, NamedSchema>();
	readonly aliases: Alias[] = [];
	readonly #resolver: Resolver;
	readonly #diagnostics: Diagnostics;
	readonly #options: SchemaBuilderOptions;
	readonly #byName = new Map<string, string>();
	readonly #queue: { id: string; value: unknown }[] = [];
	/** Objects `allOf` merged, and where: `#checkExtends` settles their parents. */
	readonly #composed = new Map<ObjectNode, Location>();
	/** Objects whose `required` names a key no property declares, and where. */
	readonly #requiring = new Map<ObjectNode, Location>();
	/** Such an object beside the union it applies to: `required` next to `oneOf`. */
	readonly #besideUnion = new Map<ObjectNode, UnionNode>();
	readonly #discriminators = new Map<UnionNode, Location>();
	readonly #warnedFormats = new Set<string>();
	readonly #legacyFiles = new Set<string>();
	/** Records built from an object that declares nothing: `{}` once sealed. */
	readonly #undeclared = new WeakSet<SchemaNode>();

	constructor(
		resolver: Resolver,
		diagnostics: Diagnostics,
		options: SchemaBuilderOptions,
	) {
		this.#resolver = resolver;
		this.#diagnostics = diagnostics;
		this.#options = options;
	}

	/**
	 * A root `components.schemas` entry. These are registered before anything
	 * else, so a component's key wins the name of the schema it points at.
	 */
	component(key: string, value: unknown, at: Location): void {
		const resolved = this.#resolver.deref(value, at);
		const existing = this.named.get(resolved.id);
		if (!existing) {
			this.#register(resolved, key, 'component');
			return;
		}
		const name = pascalCase(key);
		if (name !== existing.name && this.#claim(name, existing.id, at)) {
			this.aliases.push({ name, target: existing.id, location: at });
		}
	}

	/**
	 * A schema written inline in a body or a response. An object or a union
	 * gets `name`, so the generated code has something to call it; a scalar,
	 * a list or a `$ref` stays as it is.
	 */
	inline(value: unknown, at: Location, name: string): SchemaNode {
		const id = locationId(at);
		if (this.named.has(id)) return { kind: 'ref', target: id };
		const node = this.node(value, at);
		if (!NAMED_KINDS.has(node.kind)) return node;
		this.named.set(id, {
			id,
			name: this.#nameFor(id, at, name),
			location: at,
			source: 'inline',
			node,
			recursive: false,
		});
		return { kind: 'ref', target: id };
	}

	/** The node for the schema `value`, found at `at`. */
	node(value: unknown, at: Location): SchemaNode {
		if (value === undefined || value === true) return { kind: 'unknown' };
		if (value === false) return { kind: 'never' };
		if (!isObject(value)) {
			this.#diagnostics.error(
				'invalid_schema',
				'a schema must be an object or a boolean',
				at,
			);
			return { kind: 'unknown' };
		}
		if ('$ref' in value) return this.#reference(value, at);
		this.#refuseUnsupported(value, at);
		const node = this.#annotate(this.#structure(value, at), value, at);
		if ('unevaluatedProperties' in value) {
			this.#seal(
				node,
				value.unevaluatedProperties,
				child(at, 'unevaluatedProperties'),
			);
		}
		return node;
	}

	/**
	 * `unevaluatedProperties: false`: a key no part of the schema evaluates is
	 * refused. An object in the default mode becomes strict, and one whose
	 * extra keys are allowed or have a schema evaluates them all already. A
	 * union or an intersection seals its inline members and is marked
	 * `sealed`: its `$ref` members cannot be changed here, and the emitter
	 * warns when one of them accepts keys it does not declare.
	 */
	#seal(node: SchemaNode, value: unknown, at: Location): void {
		if (value === true) return;
		if (value !== false) {
			this.#diagnostics.error(
				'unsupported_keyword',
				'`unevaluatedProperties` other than `false` or `true` is not supported',
				at,
			);
			return;
		}
		if (node.kind === 'unknown') {
			this.#diagnostics.warning(
				'not_enforced',
				'`unevaluatedProperties: false` on a schema that declares nothing else is not enforced: give it `type: object` and its `properties`',
				at,
			);
			return;
		}
		const seal = (target: SchemaNode): void => {
			if (target.kind === 'object') {
				if (target.additional === 'default') target.additional = 'strict';
			} else if (target.kind === 'record' && this.#undeclared.has(target)) {
				// It declares nothing, so sealed it accepts only `{}`.
				replaceNode(target, {
					kind: 'object',
					properties: [],
					additional: 'strict',
					extends: [],
				});
			} else if (target.kind === 'ref') {
				target.sealed = true;
			} else if (target.kind === 'union') {
				// A value may match several anyOf variants and use keys from each:
				// strict variants would refuse what the spec accepts.
				if (!target.exclusive) {
					this.#diagnostics.error(
						'unsupported_keyword',
						'`unevaluatedProperties: false` over `anyOf` is not supported: a value that matches several variants may use keys from each. Use `oneOf`',
						at,
					);
					return;
				}
				target.sealed = true;
				target.variants.forEach(seal);
			} else if (target.kind === 'intersection') {
				target.sealed = true;
				target.members.forEach(seal);
			}
		};
		seal(node);
	}

	/** Follows `ref` nodes to the shape they name. */
	resolve(node: SchemaNode): SchemaNode {
		let current = node;
		for (let hops = 0; current.kind === 'ref' && hops < 64; hops++) {
			const target = this.named.get(current.target);
			if (!target) break;
			current = target.node;
		}
		return current;
	}

	/** Normalizes every named schema registered but not built yet. */
	drain(): void {
		for (let item = this.#queue.shift(); item; item = this.#queue.shift()) {
			const named = this.named.get(item.id);
			if (named) named.node = this.node(item.value, named.location);
		}
	}

	/** Checks what needs every schema built, and returns them in emit order. */
	finalize(): NamedSchema[] {
		this.drain();
		this.#checkExtends();
		this.#checkRequires();
		this.#checkDiscriminators();

		const ids = [...this.named.keys()];
		const edges = new Map(
			ids.map((id) => [
				id,
				refsOf(this.named.get(id)?.node ?? { kind: 'unknown' }),
			]),
		);
		const ordered: NamedSchema[] = [];
		for (const component of stronglyConnected(
			ids,
			(id) => edges.get(id) ?? [],
		)) {
			const first = component[0] ?? '';
			const recursive =
				component.length > 1 || (edges.get(first) ?? []).includes(first);
			for (const id of component) {
				const named = this.named.get(id);
				if (!named) continue;
				named.recursive = recursive;
				ordered.push(named);
			}
		}
		return ordered;
	}

	/** `paths/employees.yaml#/get`, for messages. */
	display(at: Location): string {
		return `${relative(this.#options.rootDir, at.file)}#${at.pointer}`;
	}

	/** The key the `names` option uses for the schema at `at`. */
	overrideKey(at: Location): string {
		const file = relative(this.#options.rootDir, at.file);
		return at.pointer ? `${file}#${at.pointer}` : file;
	}

	#register(
		resolved: Resolved,
		preferred: string | undefined,
		source: NamedSchema['source'],
	): string {
		const { id, location } = resolved;
		if (this.named.has(id)) return id;
		this.named.set(id, {
			id,
			name: this.#nameFor(id, location, preferred),
			location,
			source,
			node: { kind: 'unknown' },
			recursive: false,
		});
		this.#queue.push({ id, value: resolved.value });
		return id;
	}

	#nameFor(id: string, at: Location, preferred?: string): string {
		const override = this.#options.names[this.overrideKey(at)];
		let name = override ?? pascalCase(preferred ?? nameFromLocation(at));
		const problem =
			override === undefined
				? undefined
				: !IDENTIFIER.test(override)
					? 'is not a valid identifier'
					: RESERVED.has(override)
						? 'is a reserved word, which cannot name a type'
						: undefined;
		if (override !== undefined && problem !== undefined) {
			this.#diagnostics.error(
				'invalid_option',
				`names: \`${override}\` ${problem}`,
				at,
			);
			name = pascalCase(override);
		}
		if (this.#claim(name, id, at)) return name;
		// The run fails on the collision; a placeholder keeps the rest going.
		const placeholder = `${name}$${this.#byName.size}`;
		this.#byName.set(placeholder, id);
		return placeholder;
	}

	/** Takes `name` for `id`. A second schema wanting it is an error naming both. */
	#claim(name: string, id: string, at: Location): boolean {
		const holder = this.#byName.get(name);
		if (holder === undefined || holder === id) {
			this.#byName.set(name, id);
			return true;
		}
		const other = this.named.get(holder)?.location;
		this.#diagnostics.error(
			'name_collision',
			`two schemas would both be named ${name}: this one and ${other ? this.display(other) : holder}. ` +
				`Rename one with the \`names\` option, e.g. names: { '${this.overrideKey(at)}': '${name}2' }`,
			at,
		);
		return false;
	}

	#reference(s: Record<string, unknown>, at: Location): SchemaNode {
		// A $ref that is not a string was refused by the loader already.
		if (typeof s.$ref !== 'string') return { kind: 'unknown' };
		const target = this.#register(
			this.#resolver.deref({ $ref: s.$ref }, at),
			undefined,
			'ref',
		);
		const ref: SchemaNode = { kind: 'ref', target };
		const rest = without(
			s,
			(key) =>
				key === '$ref' ||
				key === 'unevaluatedProperties' ||
				key.startsWith('x-'),
		);
		this.#refuseUnsupported(rest, at);
		let node: SchemaNode;
		if (Object.keys(rest).every((key) => ANNOTATION_KEYS.has(key))) {
			node = this.#annotate(ref, rest, at);
		} else {
			// In 3.1 a $ref next to other keywords applies both, as allOf would.
			const own = without(rest, (key) => ANNOTATION_KEYS.has(key));
			node = this.#annotate(
				this.#combine([ref, this.#structure(own, at)], [], at),
				rest,
				at,
			);
		}
		if ('unevaluatedProperties' in s) {
			this.#seal(
				node,
				s.unevaluatedProperties,
				child(at, 'unevaluatedProperties'),
			);
		}
		return node;
	}

	#annotate(
		node: SchemaNode,
		s: Record<string, unknown>,
		at: Location,
	): SchemaNode {
		const description = asString(s.description);
		if (description !== undefined) node.description = description;
		if (s.deprecated === true) node.deprecated = true;
		if (s.readOnly === true) node.readOnly = true;
		if (s.writeOnly === true) node.writeOnly = true;
		if ('default' in s) node.default = { value: s.default };
		if (s.nullable === true) {
			node.nullable = true;
			this.#legacyNullable(child(at, 'nullable'));
		}
		return node;
	}

	#legacyNullable(at: Location): void {
		if (this.#options.legacyNullable === 'error') {
			this.#diagnostics.error(
				'legacy_nullable',
				'`nullable: true` is OpenAPI 3.0; write `type: [T, "null"]`',
				at,
			);
			return;
		}
		// Once per file: a fragment library written for 3.0 would otherwise
		// bury every other warning.
		if (this.#legacyFiles.has(at.file)) return;
		this.#legacyFiles.add(at.file);
		this.#diagnostics.warning(
			'legacy_nullable',
			'uses OpenAPI 3.0 `nullable: true`, read as `type: [T, "null"]` here and everywhere else in this file',
			at,
		);
	}

	#structure(s: Record<string, unknown>, at: Location): SchemaNode {
		if (Array.isArray(s.allOf)) return this.#allOf(s, at);
		if (Array.isArray(s.oneOf) || Array.isArray(s.anyOf)) {
			return this.#union(s, at);
		}
		if ('const' in s) {
			return this.#typedLiteral(
				s,
				this.#literal([s.const], child(at, 'const')),
				at,
			);
		}
		if (Array.isArray(s.enum)) {
			const key = 'x-enum-varnames' in s ? 'x-enum-varnames' : 'x-enumNames';
			const names =
				key in s ? { key, value: s[key], at: child(at, key) } : undefined;
			return this.#typedLiteral(
				s,
				this.#literal(s.enum, child(at, 'enum'), names),
				at,
			);
		}

		const { types, nullable, any } = this.#types(s, at);
		let node: SchemaNode;
		if (any) node = { kind: 'unknown' };
		else if (types.length === 0) {
			node = nullable ? { kind: 'null' } : this.#inferred(s, at);
		} else if (types.length === 1) {
			node = this.#typed(types[0] ?? 'null', s, at);
		} else {
			node = {
				kind: 'union',
				exclusive: false,
				variants: types.map((type) => this.#typed(type, s, at)),
			};
		}
		if (nullable && node.kind !== 'null') node.nullable = true;
		return node;
	}

	#types(
		s: Record<string, unknown>,
		at: Location,
	): { types: string[]; nullable: boolean; any: boolean } {
		if (s.type === undefined) return { types: [], nullable: false, any: false };
		const types: string[] = [];
		let nullable = false;
		for (const type of Array.isArray(s.type) ? s.type : [s.type]) {
			if (typeof type !== 'string' || !JSON_TYPES.has(type)) {
				this.#diagnostics.error(
					'invalid_schema',
					`\`type: ${JSON.stringify(type)}\` is not a JSON Schema type`,
					child(at, 'type'),
				);
			} else if (type === 'null') nullable = true;
			else if (!types.includes(type)) types.push(type);
		}
		// `number` already admits every integer.
		const merged = types.includes('number')
			? types.filter((type) => type !== 'integer')
			: types;
		// `unknown` takes null too, so every other type alone is a union.
		const any =
			nullable &&
			['string', 'number', 'boolean', 'array', 'object'].every((type) =>
				merged.includes(type),
			);
		return { types: merged, nullable, any };
	}

	/** A schema with no `type`: what its other keywords say it is. */
	#inferred(s: Record<string, unknown>, at: Location): SchemaNode {
		const has = (...keys: string[]) => keys.some((key) => key in s);
		if (has('properties', 'additionalProperties', 'required')) {
			return this.#object(s, at);
		}
		if (has('items')) return this.#array(s, at);
		if (
			has(
				'minimum',
				'maximum',
				'exclusiveMinimum',
				'exclusiveMaximum',
				'multipleOf',
			)
		) {
			return this.#number(false, s, at);
		}
		if (
			has(
				'minLength',
				'maxLength',
				'pattern',
				'format',
				'contentMediaType',
				'contentEncoding',
			)
		) {
			return this.#string(s, at);
		}
		// These bind only a list or an object, and saying which is `type`'s job.
		const [constraint] = [
			'minItems',
			'maxItems',
			'uniqueItems',
			'minProperties',
			'maxProperties',
		].filter((key) => key in s);
		if (constraint !== undefined) {
			this.#diagnostics.warning(
				'not_enforced',
				`\`${constraint}\` without a \`type\` is not enforced: give the schema a \`type\``,
				child(at, constraint),
			);
		}
		return { kind: 'unknown' };
	}

	#typed(type: string, s: Record<string, unknown>, at: Location): SchemaNode {
		switch (type) {
			case 'string':
				return this.#string(s, at);
			case 'integer':
				return this.#number(true, s, at);
			case 'number':
				return this.#number(false, s, at);
			case 'boolean':
				return { kind: 'boolean' };
			case 'array':
				return this.#array(s, at);
			case 'object':
				return this.#object(s, at);
			default:
				return { kind: 'null' };
		}
	}

	#string(s: Record<string, unknown>, at: Location): SchemaNode {
		const format = asString(s.format);
		const media = asString(s.contentMediaType);
		if (
			format === 'binary' ||
			(media !== undefined &&
				s.contentEncoding === undefined &&
				!/^text\/|json$/.test(media))
		) {
			return { kind: 'binary' };
		}
		const node: StringNode = { kind: 'string' };
		if (format === 'byte' || s.contentEncoding === 'base64')
			node.format = 'byte';
		else if (format !== undefined) {
			if (STRING_FORMATS.has(format)) node.format = format as StringFormat;
			else if (!this.#warnedFormats.has(format)) {
				this.#warnedFormats.add(format);
				this.#diagnostics.warning(
					'unknown_format',
					`format \`${format}\` is not validated; it is checked as a plain string`,
					child(at, 'format'),
				);
			}
		}
		const minLength = asNumber(s.minLength);
		if (minLength !== undefined) node.minLength = minLength;
		const maxLength = asNumber(s.maxLength);
		if (maxLength !== undefined) node.maxLength = maxLength;
		const pattern = asString(s.pattern);
		if (pattern !== undefined) {
			if (isRegExp(pattern)) node.pattern = pattern;
			else {
				this.#diagnostics.error(
					'invalid_schema',
					`\`pattern\` is not a valid regular expression: ${pattern}`,
					child(at, 'pattern'),
				);
			}
		}
		return node;
	}

	#number(
		integer: boolean,
		s: Record<string, unknown>,
		at: Location,
	): SchemaNode {
		const node: NumberNode = { kind: 'number', integer };
		const format = asString(s.format);
		if (format !== undefined) {
			if (NUMBER_FORMATS.has(format)) node.format = format as NumberFormat;
			else if (!this.#warnedFormats.has(format)) {
				this.#warnedFormats.add(format);
				this.#diagnostics.warning(
					'unknown_format',
					`format \`${format}\` is not validated; it is checked as a plain ${integer ? 'integer' : 'number'}`,
					child(at, 'format'),
				);
			}
		}
		for (const key of ['minimum', 'maximum', 'multipleOf'] as const) {
			const value = asNumber(s[key]);
			if (value !== undefined) node[key] = value;
		}
		for (const key of ['exclusiveMinimum', 'exclusiveMaximum'] as const) {
			const value = s[key];
			if (typeof value === 'number') node[key] = value;
			else if (typeof value === 'boolean') {
				this.#diagnostics.error(
					'invalid_schema',
					`a boolean \`${key}\` is OpenAPI 3.0; in 3.1 it is the bound itself (\`${key}: <number>\`)`,
					child(at, key),
				);
			}
		}
		return node;
	}

	#array(s: Record<string, unknown>, at: Location): SchemaNode {
		let items: SchemaNode = { kind: 'unknown' };
		if (Array.isArray(s.items)) {
			this.#diagnostics.error(
				'unsupported_keyword',
				'a list of `items` (a tuple) is not supported',
				child(at, 'items'),
			);
		} else if ('items' in s) items = this.node(s.items, child(at, 'items'));
		const node: ArrayNode = { kind: 'array', items };
		const minItems = asNumber(s.minItems);
		if (minItems !== undefined) node.minItems = minItems;
		const maxItems = asNumber(s.maxItems);
		if (maxItems !== undefined) node.maxItems = maxItems;
		if (s.uniqueItems === true) {
			this.#diagnostics.warning(
				'not_enforced',
				'`uniqueItems` is not enforced',
				child(at, 'uniqueItems'),
			);
		}
		return node;
	}

	#object(s: Record<string, unknown>, at: Location): SchemaNode {
		const required = new Set(strings(s.required));
		const properties: Property[] = [];
		if (isObject(s.properties)) {
			for (const [name, value] of Object.entries(s.properties)) {
				properties.push({
					name,
					required: required.has(name),
					schema: this.node(value, child(at, 'properties', name)),
				});
			}
		} else if (s.properties !== undefined) {
			this.#diagnostics.error(
				'invalid_schema',
				'`properties` must be an object',
				child(at, 'properties'),
			);
		}
		const additional = this.#additional(
			s.additionalProperties,
			child(at, 'additionalProperties'),
		);
		for (const key of ['minProperties', 'maxProperties']) {
			if (key in s) {
				this.#diagnostics.warning(
					'not_enforced',
					`\`${key}\` is not enforced`,
					child(at, key),
				);
			}
		}
		// `required` may name a key no property here declares: an `allOf`
		// sibling's, a parent's, or nobody's. `#checkRequires` settles it.
		const undeclared = [...required].filter(
			(name) => !properties.some((p) => p.name === name),
		);
		if (undeclared.length > 0) {
			const node: ObjectNode = {
				kind: 'object',
				properties,
				additional,
				extends: [],
				requires: undeclared,
			};
			this.#requiring.set(node, child(at, 'required'));
			return node;
		}
		if (properties.length === 0) {
			if (typeof additional === 'object') {
				return { kind: 'record', values: additional.schema };
			}
			// An object that declares nothing accepts anything; stripping unknown
			// keys would hand the handler an empty object.
			if (additional !== 'strict') {
				const record: SchemaNode = {
					kind: 'record',
					values: { kind: 'unknown' },
				};
				if (additional === 'default') this.#undeclared.add(record);
				return record;
			}
		}
		return { kind: 'object', properties, additional, extends: [] };
	}

	#additional(value: unknown, at: Location): Additional {
		if (value === undefined) return 'default';
		if (value === false) return 'strict';
		if (
			value === true ||
			(isObject(value) && Object.keys(value).length === 0)
		) {
			return 'loose';
		}
		return { schema: this.node(value, at) };
	}

	#literal(
		values: unknown[],
		at: Location,
		names?: { key: string; value: unknown; at: Location },
	): SchemaNode {
		const kept: Scalar[] = [];
		let nullable = false;
		for (const value of values) {
			if (value === null) nullable = true;
			else if (
				typeof value === 'string' ||
				typeof value === 'number' ||
				typeof value === 'boolean'
			) {
				kept.push(value);
			} else {
				this.#diagnostics.error(
					'invalid_schema',
					'an `enum` or `const` value must be a string, number, boolean or null',
					at,
				);
			}
		}
		if (kept.length === 0) {
			return nullable ? { kind: 'null' } : { kind: 'never' };
		}
		const named =
			names && this.#enumNames(values, names.value, names.at, names.key);
		return {
			kind: 'literal',
			values: kept,
			...(nullable ? { nullable } : {}),
			...(named ? { names: named } : {}),
		};
	}

	/** `x-enum-varnames`: one distinct identifier per `enum` value, the one for `null` dropped. */
	#enumNames(
		values: unknown[],
		names: unknown,
		at: Location,
		key: string,
	): string[] | undefined {
		if (
			!Array.isArray(names) ||
			names.length !== values.length ||
			!names.every(
				(name) => typeof name === 'string' && IDENTIFIER.test(name),
			) ||
			new Set(names).size !== names.length
		) {
			this.#diagnostics.error(
				'invalid_schema',
				`${key} must list one distinct identifier per enum value`,
				at,
			);
			return undefined;
		}
		return names.filter((_, index) => values[index] !== null);
	}

	#union(s: Record<string, unknown>, at: Location): SchemaNode {
		const key = Array.isArray(s.oneOf) ? 'oneOf' : 'anyOf';
		if (Array.isArray(s.oneOf) && Array.isArray(s.anyOf)) {
			this.#diagnostics.error(
				'unsupported_keyword',
				'`oneOf` and `anyOf` together are not supported',
				child(at, 'anyOf'),
			);
		}
		const variants: SchemaNode[] = [];
		let nullable = false;
		for (const [index, value] of (s[key] as unknown[]).entries()) {
			const variant = this.node(value, child(at, key, index));
			if (variant.kind === 'null') nullable = true;
			else variants.push(variant);
		}

		let node: SchemaNode;
		const [only] = variants;
		if (!only) node = { kind: 'null' };
		else if (variants.length === 1) node = only;
		else {
			const union: UnionNode = {
				kind: 'union',
				variants,
				exclusive: key === 'oneOf',
			};
			const property = isObject(s.discriminator)
				? asString(s.discriminator.propertyName)
				: undefined;
			if (property !== undefined) {
				union.discriminator = property;
				this.#discriminators.set(union, child(at, 'discriminator'));
			}
			node = union;
		}
		if (nullable && node.kind !== 'null') node.nullable = true;

		// Keywords next to the variants apply on top of whichever one matches.
		const base = without(
			s,
			(k) =>
				k === 'oneOf' ||
				k === 'anyOf' ||
				k === 'discriminator' ||
				k === 'unevaluatedProperties' ||
				ANNOTATION_KEYS.has(k) ||
				k.startsWith('x-') ||
				UNSUPPORTED_KEYWORDS.includes(k),
		);
		for (const name of Object.keys(base)) {
			if (name === 'type' || BESIDE_UNION.has(name)) continue;
			this.#diagnostics.error(
				'unsupported_keyword',
				`\`${name}\` next to \`${key}\` is not supported: write it in each variant`,
				child(at, name),
			);
		}
		if (Object.keys(base).some((name) => BESIDE_UNION.has(name))) {
			const structure = this.#structure(base, at);
			if (structure.kind === 'object' && node.kind === 'union') {
				this.#besideUnion.set(structure, node);
			}
			return { kind: 'intersection', members: [structure, node] };
		}
		return node;
	}

	#allOf(s: Record<string, unknown>, at: Location): SchemaNode {
		const members = (s.allOf as unknown[]).map((value, index) =>
			this.node(value, child(at, 'allOf', index)),
		);
		const own = without(
			s,
			(k) =>
				k === 'allOf' ||
				k === 'type' ||
				ANNOTATION_KEYS.has(k) ||
				k.startsWith('x-'),
		);
		// `required` next to `allOf` names properties that live in a member.
		let requires: string[] = [];
		if ('required' in own && !('properties' in own)) {
			requires = strings(own.required);
			delete own.required;
		}
		if (Object.keys(own).length > 0) members.push(this.#structure(own, at));
		return this.#combine(members, requires, at);
	}

	/**
	 * `allOf` over objects is one object that extends the named ones, so the
	 * type is `interface X extends Base` and the validator `zBase.extend()`.
	 * Anything else is an intersection.
	 */
	#combine(
		members: SchemaNode[],
		requires: string[],
		at: Location,
	): SchemaNode {
		const [only] = members;
		if (only && members.length === 1 && requires.length === 0) return only;
		const objects = members.every(
			(member) =>
				!member.nullable && (member.kind === 'ref' || member.kind === 'object'),
		);
		if (!objects) {
			if (requires.length > 0) {
				this.#diagnostics.warning(
					'not_enforced',
					'`required` next to an `allOf` that is not all objects is not enforced',
					child(at, 'required'),
				);
			}
			return { kind: 'intersection', members };
		}
		const node: ObjectNode = {
			kind: 'object',
			properties: [],
			additional: 'default',
			extends: [],
		};
		const wanted = [...requires];
		let strictMember = false;
		for (const member of members) {
			if (member.kind === 'ref') {
				node.extends.push(member.target);
				continue;
			}
			if (member.kind !== 'object') continue;
			// Its `required` names now go to the merged object, settled there.
			this.#requiring.delete(member);
			node.extends.push(...member.extends);
			for (const property of member.properties) {
				const index = node.properties.findIndex(
					(p) => p.name === property.name,
				);
				const earlier = node.properties[index];
				if (!earlier) node.properties.push(property);
				else {
					// Every member holds, so a property two declare meets both.
					node.properties[index] = {
						name: property.name,
						required: earlier.required || property.required,
						schema: meet(earlier.schema, property.schema),
					};
				}
			}
			if (member.additional === 'strict' && members.length > 1) {
				strictMember = true;
			}
			if (member.additional !== 'default') node.additional = member.additional;
			wanted.push(...(member.requires ?? []));
		}
		if (strictMember) {
			this.#diagnostics.warning(
				'not_enforced',
				'`additionalProperties: false` on an `allOf` member refuses, in JSON Schema, the keys the other members declare; merged into one object, they are accepted. To refuse only undeclared keys, write `unevaluatedProperties: false` next to the `allOf`',
				at,
			);
		}
		for (const name of wanted) {
			const own = node.properties.find((p) => p.name === name);
			if (own) own.required = true;
			else {
				node.requires ??= [];
				if (!node.requires.includes(name)) node.requires.push(name);
			}
		}
		this.#composed.set(node, at);
		return node;
	}

	/** `extends` only works on object parents; anything else becomes an intersection. */
	#checkExtends(): void {
		for (const [node, at] of this.#composed) {
			if (node.kind !== 'object') continue;
			const usable = node.extends.every((id) => {
				const parent = this.named.get(id);
				return (
					parent !== undefined &&
					!parent.node.nullable &&
					this.resolve(parent.node).kind === 'object'
				);
			});
			if (usable) {
				// A property a parent declares too: the value meets both, and
				// what the parent requires stays required.
				for (const property of node.properties) {
					const inherited = this.#inherited(node, property.name);
					if (!inherited) continue;
					if (inherited.required) property.required = true;
					property.schema = meet(inherited.schema, property.schema);
				}
				if (node.requires) {
					const unchecked = node.requires.filter(
						(name) => this.#propertyOf(node, name) === undefined,
					);
					node.requires = node.requires.filter(
						(name) => !unchecked.includes(name),
					);
					if (node.requires.length === 0) delete node.requires;
					this.#notChecked(unchecked, at);
				}
				continue;
			}
			// A parent that is not an object: an intersection, which still
			// requires what `required` names, copied from the parent declaring it.
			const properties = [...node.properties];
			const unchecked: string[] = [];
			for (const name of node.requires ?? []) {
				const found = this.#inherited(node, name);
				if (found) properties.push({ ...found, required: true });
				else unchecked.push(name);
			}
			this.#notChecked(unchecked, at);
			const members: SchemaNode[] = node.extends.map((target) => ({
				kind: 'ref',
				target,
			}));
			if (properties.length > 0 || node.additional !== 'default') {
				members.push({
					kind: 'object',
					properties,
					additional: node.additional,
					extends: [],
				});
			}
			replaceNode(node, { kind: 'intersection', members });
		}
	}

	#checkDiscriminators(): void {
		for (const [union, at] of this.#discriminators) {
			const property = union.discriminator;
			if (property === undefined) continue;
			const problem = this.#discriminatorProblem(union, property);
			if (problem === undefined) continue;
			delete union.discriminator;
			this.#diagnostics.warning(
				'discriminator_fallback',
				`discriminator \`${property}\` cannot pick a variant (${problem}); validated as a plain union, which tries each variant in turn`,
				at,
			);
		}
	}

	#discriminatorProblem(
		union: UnionNode,
		property: string,
	): string | undefined {
		const seen = new Set<string>();
		for (const [index, variant] of union.variants.entries()) {
			const object = this.resolve(variant);
			if (object.kind !== 'object') return `variant ${index} is not an object`;
			const found = this.#propertyOf(object, property);
			if (!found) return `variant ${index} has no \`${property}\``;
			if (!found.required && !object.requires?.includes(property)) {
				return `\`${property}\` is optional in variant ${index}`;
			}
			const value = this.resolve(found.schema);
			if (value.kind !== 'literal' || value.nullable) {
				return `\`${property}\` is not a constant in variant ${index}`;
			}
			for (const literal of value.values) {
				const key = JSON.stringify(literal);
				if (seen.has(key)) return `two variants share ${key}`;
				seen.add(key);
			}
		}
		return undefined;
	}

	/** Refuses, each at its pointer, the keywords v1 cannot express. */
	#refuseUnsupported(s: Record<string, unknown>, at: Location): void {
		for (const keyword of UNSUPPORTED_KEYWORDS) {
			if (keyword in s) {
				this.#diagnostics.error(
					'unsupported_keyword',
					`\`${keyword}\` is not supported`,
					child(at, keyword),
				);
			}
		}
	}

	/** `type: string` beside `enum: [a, null]`: both apply, so `null` is out. */
	#typedLiteral(
		s: Record<string, unknown>,
		node: SchemaNode,
		at: Location,
	): SchemaNode {
		if (s.type === undefined || this.#types(s, at).nullable) return node;
		if (node.kind === 'null') return { kind: 'never' };
		delete node.nullable;
		return node;
	}

	/** Says that these `required` names are not checked. */
	#notChecked(names: readonly string[], at: Location): void {
		if (names.length === 0) return;
		const list = names.map((name) => `\`${name}\``).join(', ');
		this.#diagnostics.warning(
			'not_enforced',
			`\`required\` names ${list}, which no \`properties\` declares: whether the key is present is not checked. Declare it under \`properties\``,
			at,
		);
	}

	/**
	 * `required` names that no `properties` declares, as `#object` found
	 * them. A key `additionalProperties` gives a schema is a required
	 * property of that schema; beside a union, a name every variant requires
	 * already holds; any other is not checked, and a warning says so.
	 */
	#checkRequires(): void {
		for (const [node, at] of this.#requiring) {
			const union = this.#besideUnion.get(node);
			const names = (node.requires ?? []).filter(
				(name) => !(union && this.#everyVariantRequires(union, name)),
			);
			delete node.requires;
			const unchecked: string[] = [];
			for (const name of names) {
				if (typeof node.additional === 'object') {
					node.properties.push({
						name,
						required: true,
						schema: node.additional.schema,
					});
				} else if (node.additional === 'strict') {
					this.#diagnostics.error(
						'invalid_schema',
						`\`${name}\` is required, yet no property declares it and no other key is allowed`,
						at,
					);
				} else unchecked.push(name);
			}
			this.#notChecked(unchecked, at);
			// Nothing declared after all: an object of anything, as without `required`.
			if (
				node.properties.length === 0 &&
				(node.additional === 'default' || node.additional === 'loose')
			) {
				replaceNode(node, { kind: 'record', values: { kind: 'unknown' } });
			}
		}
	}

	#everyVariantRequires(union: UnionNode, name: string): boolean {
		return union.variants.every((variant) => {
			const object = this.resolve(variant);
			if (object.kind !== 'object') return false;
			return (
				this.#propertyOf(object, name)?.required === true ||
				object.requires?.includes(name) === true
			);
		});
	}

	/** A property one of the parents of `object` declares. */
	#inherited(object: ObjectNode, name: string): Property | undefined {
		for (const id of object.extends) {
			const parent = this.named.get(id);
			const resolved = parent && this.resolve(parent.node);
			if (resolved?.kind !== 'object') continue;
			const found = this.#propertyOf(resolved, name);
			if (found) return found;
		}
		return undefined;
	}

	/** A property of `object`, its own or one it extends. */
	#propertyOf(
		object: ObjectNode,
		name: string,
		seen = new Set<string>(),
	): Property | undefined {
		const own = object.properties.find((p) => p.name === name);
		if (own) return own;
		for (const id of object.extends) {
			if (seen.has(id)) continue;
			seen.add(id);
			const parent = this.named.get(id);
			const resolved = parent && this.resolve(parent.node);
			if (resolved?.kind !== 'object') continue;
			const found = this.#propertyOf(resolved, name, seen);
			if (found) return found;
		}
		return undefined;
	}
}
