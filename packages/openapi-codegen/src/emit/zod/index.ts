/**
 * `zod.ts`: one Zod 4 schema per named schema, `z<Name>`, in dependency
 * order.
 *
 * A schema in a reference cycle is annotated `z.ZodType<X, XInput>` (from
 * `types.ts`), which is what lets TypeScript type it at all; inside it, a
 * property that reaches a schema not initialized yet is a getter, and any
 * other such reference is `z.lazy()`.
 */
import type { EmitContext } from '../context';
import { zodImports } from '../nxgt-zod';
import { docComment, docLines, file, list } from '../printer';
import { expr } from './nodes';
import { ISO_DATE, type Scope } from './scope';

export function emitZod(ctx: EmitContext): string {
	const types = new Set<string>();
	/** The enum objects of `types.ts`, imported as values for `z.enum()`. */
	const values = new Set<string>();
	const declared = new Set<string>();
	const helpers = new Set<string>();
	const imports = new Set<string>();
	const blocks: string[] = [];
	for (const schema of ctx.ir.schemas) {
		let annotation = '';
		if (schema.recursive) {
			const input = ctx.typeName(schema.id, true);
			types.add(schema.name).add(input);
			annotation = `: z.ZodType<${schema.name}, ${input}>`;
			imports.add('z');
		}
		const scope: Scope = {
			declared,
			lazy: false,
			indent: '',
			helpers,
			imports,
		};
		const members = ctx.enumOf(schema.id);
		if (members) {
			values.add(schema.name);
			imports.add('z');
		}
		const value = members
			? `z.enum(${schema.name})${members.nullable ? '.nullable()' : ''}`
			: expr(ctx, schema.node, scope);
		blocks.push(
			[
				...docComment(docLines(schema.node), ''),
				`export const z${schema.name}${annotation} = ${value};`,
			].join('\n'),
		);
		declared.add(schema.id);
	}
	for (const alias of ctx.ir.aliases) {
		blocks.push(
			`export const z${alias.name} = z${ctx.schema(alias.target).name};`,
		);
	}
	// A spec with no schema: no `z` to import, which an app's `noUnusedLocals`
	// refuses, but still a module, which `operations.ts` imports.
	if (blocks.length === 0) return file([ctx.header, 'export {};']);
	const lines = zodImports(imports);
	if (values.size > 0) {
		lines.push(
			`import ${list('{ ', [...values].sort(), ' }', '')} from './types${ctx.options.importExtension}';`,
		);
	}
	if (types.size > 0) {
		lines.push(
			`import type ${list('{ ', [...types].sort(), ' }', '')} from './types${ctx.options.importExtension}';`,
		);
	}
	return file([
		ctx.header,
		lines.join('\n'),
		...(helpers.has('isoDate') ? [ISO_DATE] : []),
		...blocks,
	]);
}
