/** The options every emitter reads. */
import type { SchemaNode } from '../ir/types';

/** What an object does with keys it does not declare, when the spec does not say. */
export type UnknownKeys = 'strip' | 'strict' | 'loose';

/** A named enum as an `as const` object that `z.enum()` reuses, or as a plain union. */
export type Enums = 'object' | 'union';

/** A `date-time` as the string JSON carries, or decoded to a `Date`. */
export type Dates = 'string' | 'date';

/** How a scalar of `@nxgt/typespec` is validated: by its `pattern`, or by the schema of `@nxgt/zod`. */
export type Scalars = 'pattern' | 'exact';

/** What an object does with undeclared keys once the `unknownKeys` default is applied. */
export type ObjectMode = UnknownKeys | { schema: SchemaNode };

export interface EmitOptions {
	unknownKeys: UnknownKeys;
	enums: Enums;
	/** Appended to imports between generated files: `.js` works under every `moduleResolution`. */
	importExtension: '' | '.js' | '.ts';
	/** The spec, relative to the output directory, for the header. */
	source: string;
	/** Where diagnostics are reported relative to. */
	rootDir: string;
	/** Also emit `hono.ts`. */
	hono?: boolean;
	/** Also emit `alxia.ts`. */
	alxia?: boolean;
	/** `date-time` as a string (the default), or decoded to a `Date` by a codec. */
	dates?: Dates;
	/**
	 * A scalar of `@nxgt/typespec` by its pattern (the default), or by its
	 * `@nxgt/zod` schema, the spec's `pattern` and length bounds kept on top as
	 * `.check()`s.
	 */
	scalars?: Scalars;
}
