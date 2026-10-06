import type { Diagnostics } from '../../errors';
import type { Location } from '../../loader/location';
import type { Resolved, Resolver } from '../../loader/resolver';
import type { SchemaBuilderOptions } from '../schemas';
import type { NamedSchema, ObjectNode, SchemaNode, UnionNode } from '../types';

/**
 * What `SchemaBuilder` holds, handed to the keyword handlers as an explicit
 * argument. Each handler takes only the part it reads, as a `Pick` of it.
 */
export interface SchemaState {
	/** Every named schema, by the id of the node it names: the builder's own `named`. */
	readonly named: Map<string, NamedSchema>;
	readonly resolver: Resolver;
	readonly diagnostics: Diagnostics;
	readonly options: SchemaBuilderOptions;
	/** Objects `allOf` merged, and where: `checkExtends` settles their parents. */
	readonly composed: Map<ObjectNode, Location>;
	/** Objects whose `required` names a key no property declares, and where. */
	readonly requiring: Map<ObjectNode, Location>;
	/** Such an object beside the union it applies to: `required` next to `oneOf`. */
	readonly besideUnion: Map<ObjectNode, UnionNode>;
	readonly discriminators: Map<UnionNode, Location>;
	readonly warnedFormats: Set<string>;
	readonly legacyFiles: Set<string>;
	/** Records built from an object that declares nothing: `{}` once sealed. */
	readonly undeclared: WeakSet<SchemaNode>;
	/** The node for the schema `value`, found at `at`: the builder's `node`. */
	node(value: unknown, at: Location): SchemaNode;
	/** The shape `s` describes, its annotations, `$ref` and sealing apart. */
	structure(s: Record<string, unknown>, at: Location): SchemaNode;
	/** Names the schema `resolved` and queues it to be built; returns its id. */
	register(
		resolved: Resolved,
		preferred: string | undefined,
		source: NamedSchema['source'],
	): string;
	/** Follows `ref` nodes to the shape they name: the builder's `resolve`. */
	resolve(node: SchemaNode): SchemaNode;
}
