/**
 * The HTTP side of the spec.
 *
 * In `types.ts`: `Operations`, keyed by `operationId`, whose entries
 * carry what a handler gets (parameters and bodies as validated) and the
 * replies, plus the indexes `OperationsByRoute`, `PathsByMethod`,
 * `OperationsByTag` and `PathsByTag`. What a caller sends is `paths.ts`'s
 * business. In `operations.ts`: the same operations as data, with the
 * validators that read them off a request, which the Hono integration runs.
 *
 * Each part lives under `operation/`, one file per role; this file only
 * puts them in order.
 */
import { type EmitContext, paramGroups } from './context';
import { clientOperationsType } from './operation/client-types';
import { formObject, paramObject } from './operation/from-string';
import { operationsType } from './operation/handler-types';
import { HELPERS, type Helper } from './operation/helpers';
import { operationIndexes } from './operation/indexes';
import { groupObject } from './operation/read';
import { SPEC_TYPES } from './operation/spec-types';
import { operationTable } from './operation/table';
import { docComment, list } from './printer';
import { type } from './types';
import type { Scope } from './zod';

// ---------------------------------------------------------------- types.ts

export function operationTypes(ctx: EmitContext): string[] {
	const blocks: string[] = [];
	for (const operation of ctx.ir.operations) {
		for (const group of paramGroups(operation)) {
			blocks.push(
				`export interface ${group.name} ${type(ctx, groupObject(group), false, '')}`,
			);
		}
	}
	blocks.push(
		operationsType(ctx),
		clientOperationsType(ctx),
		...operationIndexes(ctx),
	);
	return blocks;
}

// ----------------------------------------------------------- operations.ts

export function emitOperations(ctx: EmitContext): {
	sections: string[];
	imports: string[];
} {
	const helpers = new Set<Helper>();
	const uses = new Set<string>();
	/** What `expr` needs declared: the date codec. */
	const codecs = new Set<string>();
	const declared = new Set(ctx.ir.schemas.map((schema) => schema.id));
	const scope = (indent: string): Scope => ({
		declared,
		lazy: false,
		indent,
		uses,
		helpers: codecs,
	});

	const validators: string[] = [];
	for (const operation of ctx.ir.operations) {
		for (const group of paramGroups(operation)) {
			validators.push(
				`export const z${group.name} = ${paramObject(ctx, group, helpers, scope)};`,
			);
		}
		const form = ctx.formOf(operation);
		if (form) {
			validators.push(
				[
					...docComment(
						[
							`\`${operation.operationId}\`'s form body, its fields read from text.`,
						],
						'',
					),
					`export const z${operation.name}Form = ${formObject(ctx, form.object, helpers, scope)};`,
				].join('\n'),
			);
		}
	}
	const table = operationTable(ctx, helpers, scope);
	if (codecs.has('isoDate')) helpers.add('isoDate');

	const ext = ctx.options.importExtension;
	const imports = ["import { z } from 'zod';"];
	if (uses.size > 0) {
		const names = [...uses].map((id) => `z${ctx.schema(id).name}`).sort();
		imports.push(`import ${list('{ ', names, ' }', '')} from './zod${ext}';`);
	}
	imports.push(
		`import type { ClientOperations, Operations } from './types${ext}';`,
	);
	return {
		imports,
		sections: [
			SPEC_TYPES,
			...[...helpers].sort().map((helper) => HELPERS[helper]),
			...validators,
			table,
		],
	};
}
