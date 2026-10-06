import { relative } from 'node:path';
import type { Diagnostics } from '../errors';
import { type Location, locationId } from '../loader/location';
import type { Resolved, Resolver } from '../loader/resolver';
import { IDENTIFIER, nameFromLocation, pascalCase } from './naming';
import { checkDiscriminators } from './schema/discriminators';
import { checkExtends } from './schema/extends';
import { schemaNode, structure } from './schema/node';
import { emitOrder } from './schema/order';
import { checkRequires } from './schema/requires';
import type { SchemaState } from './schema/state';
import type { Alias, NamedSchema, SchemaNode } from './types';

/** Words a `names` override cannot be: `export interface default` does not compile. */
export const RESERVED = new Set([
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
	// The keyword handlers live under `schema/`, one file per keyword family,
	// each a function that takes the part of `#state` it reads.
	/** Every named schema, by the id of the node it names. */
	readonly named = new Map<string, NamedSchema>();
	readonly aliases: Alias[] = [];
	readonly #state: SchemaState;
	readonly #byName = new Map<string, string>();
	readonly #queue: { id: string; value: unknown }[] = [];

	constructor(
		resolver: Resolver,
		diagnostics: Diagnostics,
		options: SchemaBuilderOptions,
	) {
		const state: SchemaState = {
			named: this.named,
			resolver,
			diagnostics,
			options,
			composed: new Map(),
			requiring: new Map(),
			besideUnion: new Map(),
			discriminators: new Map(),
			warnedFormats: new Set(),
			legacyFiles: new Set(),
			undeclared: new WeakSet(),
			node: (value, at) => this.node(value, at),
			structure: (s, at) => structure(state, s, at),
			register: (resolved, preferred, source) =>
				this.#register(resolved, preferred, source),
			resolve: (node) => this.resolve(node),
		};
		this.#state = state;
	}

	/**
	 * A root `components.schemas` entry. These are registered before anything
	 * else, so a component's key wins the name of the schema it points at.
	 */
	component(key: string, value: unknown, at: Location): void {
		const resolved = this.#state.resolver.deref(value, at);
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
		return schemaNode(this.#state, value, at);
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
		checkExtends(this.#state);
		checkRequires(this.#state);
		checkDiscriminators(this.#state);
		return emitOrder(this.named);
	}

	/** `paths/employees.yaml#/get`, for messages. */
	display(at: Location): string {
		return `${relative(this.#state.options.rootDir, at.file)}#${at.pointer}`;
	}

	/** The key the `names` option uses for the schema at `at`. */
	overrideKey(at: Location): string {
		const file = relative(this.#state.options.rootDir, at.file);
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
		const override = this.#state.options.names[this.overrideKey(at)];
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
			this.#state.diagnostics.error(
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
		this.#state.diagnostics.error(
			'name_collision',
			`two schemas would both be named ${name}: this one and ${other ? this.display(other) : holder}. ` +
				`Rename one with the \`names\` option, e.g. names: { '${this.overrideKey(at)}': '${name}2' }`,
			at,
		);
		return false;
	}
}
