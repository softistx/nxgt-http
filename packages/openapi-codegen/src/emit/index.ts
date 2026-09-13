import type { Diagnostic } from '../errors';
import type { ApiIR } from '../ir/types';
import { EmitContext, type EmitOptions } from './context';
import { emitOperations, operationTypes } from './operations';
import { emitPaths } from './paths';
import { file } from './printer';
import { schemaTypes } from './types';
import { emitZod } from './zod';

export interface GeneratedFile {
	path: string;
	content: string;
}

/** Every generated file, named relative to the output directory, and what it does not enforce. */
export function emitFiles(
	ir: ApiIR,
	options: EmitOptions,
): { files: GeneratedFile[]; warnings: Diagnostic[] } {
	const ctx = new EmitContext(ir, options);
	const operations = emitOperations(ctx);
	const files = [
		{
			path: 'types.gen.ts',
			content: file([ctx.header, ...schemaTypes(ctx), ...operationTypes(ctx)]),
		},
		{ path: 'zod.gen.ts', content: emitZod(ctx) },
		{
			path: 'operations.gen.ts',
			content: file([
				ctx.header,
				operations.imports.join('\n'),
				...operations.sections,
			]),
		},
		{ path: 'paths.gen.ts', content: emitPaths(ctx) },
	];
	return { files, warnings: ctx.warnings };
}
