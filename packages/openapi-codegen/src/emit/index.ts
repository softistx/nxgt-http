import type { Diagnostic } from '../errors';
import type { ApiIR } from '../ir/types';
import { EmitContext, type EmitOptions } from './context';
import { emitHono } from './hono';
import { emitOperations, operationTypes } from './operations';
import { emitPaths } from './paths';
import { file } from './printer';
import { schemaTypes, WIRE_TYPE } from './types';
import { emitZod } from './zod';

export interface GeneratedFile {
	path: string;
	content: string;
}

/** Every file the generator can write, whichever options are on. */
export const FILE_NAMES = [
	'types.ts',
	'zod.ts',
	'operations.ts',
	'paths.ts',
	'hono.ts',
] as const;

/** Every generated file, named relative to the output directory, and what it does not enforce. */
export function emitFiles(
	ir: ApiIR,
	options: EmitOptions,
): { files: GeneratedFile[]; warnings: Diagnostic[] } {
	const ctx = new EmitContext(ir, options);
	const operations = emitOperations(ctx);
	const files = [
		{
			path: 'types.ts',
			content: file([
				ctx.header,
				...schemaTypes(ctx),
				...operationTypes(ctx),
				...(options.dates === 'date' ? [WIRE_TYPE] : []),
			]),
		},
		{ path: 'zod.ts', content: emitZod(ctx) },
		{
			path: 'operations.ts',
			content: file([
				ctx.header,
				operations.imports.join('\n'),
				...operations.sections,
			]),
		},
		{ path: 'paths.ts', content: emitPaths(ctx) },
		...(options.hono ? [{ path: 'hono.ts', content: emitHono(ctx) }] : []),
	];
	return { files, warnings: ctx.warnings };
}
