import type { ApiIR } from '../ir/types';
import { EmitContext, type EmitOptions } from './context';
import { emitTypes } from './types';
import { emitZod } from './zod';

export interface GeneratedFile {
	path: string;
	content: string;
}

/** Every generated file, named relative to the output directory. */
export function emitFiles(ir: ApiIR, options: EmitOptions): GeneratedFile[] {
	const ctx = new EmitContext(ir, options);
	return [
		{ path: 'types.gen.ts', content: emitTypes(ctx) },
		{ path: 'zod.gen.ts', content: emitZod(ctx) },
	];
}
