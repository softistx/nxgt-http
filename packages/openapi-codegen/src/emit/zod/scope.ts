/** What the printing of a schema tracks: which schemas exist yet, and what the file imports. */
import type { EmitContext } from '../context';

export interface Scope {
	/** Schemas whose `const` is initialized by the time this code runs. */
	declared: ReadonlySet<string>;
	/** Inside a getter, which runs only after every `const` is initialized. */
	lazy: boolean;
	indent: string;
	/** Collects the schemas referenced, for a file that imports them. */
	uses?: Set<string>;
	/** Collects the helpers used, for a file that declares them: `isoDate`. */
	helpers: Set<string>;
	/**
	 * Collects what a file imports for its schemas: `z` when a schema calls it,
	 * else the `@nxgt/zod` exports. A file that imports `z` and never calls it
	 * fails an app's `noUnusedLocals`.
	 */
	imports: Set<string>;
}

/** Declared by a file whose validators decode a `date-time`. */
export const ISO_DATE = [
	'/** An RFC 3339 date-time, decoded to a Date and encoded back. */',
	'const isoDate = {',
	'\tdecode: (value: string): Date => new Date(value),',
	'\tencode: (date: Date): string => date.toISOString(),',
	'};',
].join('\n');

/** `zEmployee`, noted as used so the file that prints it can import it. */
export function named(ctx: EmitContext, id: string, scope: Scope): string {
	scope.uses?.add(id);
	return `z${ctx.schema(id).name}`;
}

export function reference(
	ctx: EmitContext,
	target: string,
	scope: Scope,
): string {
	const name = named(ctx, target, scope);
	return scope.lazy || scope.declared.has(target)
		? name
		: `z.lazy(() => ${name})`;
}
