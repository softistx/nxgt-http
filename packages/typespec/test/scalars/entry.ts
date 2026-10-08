/** One scalar of `lib/scalars/`, as the registry spec checks it. */
export interface ScalarEntry {
	/**
	 * The `@nxgt/graphql-scalars` name: the OpenAPI component the scalar
	 * emits (its `@friendlyName`) and its `x-nxgt-scalar`.
	 */
	readonly name: string;
	/** The TypeSpec identifier, in `Nxgt`; its file is its kebab-case name. */
	readonly scalar: string;
	/** The `format` it emits: JSON Schema's when one exists, else kebab-case. */
	readonly format?: string;
	/**
	 * The GraphQL scalar's `@specifiedBy`, which its description ends with as
	 * `Specified by <url>.`: the emitter writes no `externalDocs` for a scalar.
	 */
	readonly specifiedBy?: string;
	/** Values the generated validator accepts, the first sent in every body. */
	readonly accept: readonly [unknown, ...unknown[]];
	/** Values the generated validator refuses, each answered with a 400. */
	readonly refuse: readonly unknown[];
}

/** A GraphQL scalar TypeSpec already spells, declared nowhere in `lib/`. */
export interface BuiltinEntry {
	readonly name: string;
	/** The TypeSpec type it is written as, such as `void`. */
	readonly builtin: string;
}

export type Entry = ScalarEntry | BuiltinEntry;
