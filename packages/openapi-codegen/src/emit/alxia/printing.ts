/** What every schema of `alxia.ts` is printed with, and what it ends up using. */
import type { MediaIR } from '../../ir/types';
import type { EmitContext } from '../context';
import type { Helper } from '../operation/helpers';
import type { Scope } from '../zod';

export type Local = 'commas' | 'headerList';

/** Declared at the top of `alxia.ts` when a schema uses them, beside `operations.ts`'s. */
export const LOCALS: Record<Local, string> = {
	commas: [
		'/** A query list sent as `?ids=1,2`: split on commas. */',
		'const commas = (value: unknown) =>',
		"\ttypeof value === 'string' ? value.split(',') : value;",
	].join('\n'),
	headerList: [
		'/** A header list: split on commas, each item trimmed. */',
		'const headerList = (value: unknown) =>',
		"\ttypeof value === 'string'",
		"\t\t? value.split(',').map((item) => item.trim())",
		'\t\t: value;',
	].join('\n'),
};

/** What every schema of the file is printed with, and what it ends up using. */
export interface Printing {
	ctx: EmitContext;
	helpers: Set<Helper>;
	locals: Set<Local>;
	/** The named schemas referenced, imported from `zod.ts`. */
	uses: Set<string>;
	/** What `expr` needs declared: the date codec. */
	codecs: Set<string>;
	declared: ReadonlySet<string>;
	/** Whether a printed schema calls `z.` itself, so `z` is imported. */
	zod: boolean;
	eventStream: boolean;
}

/** An operation's warnings, kept only when the operation is. */
export type Issue = { message: string; at: { file: string; pointer: string } };

export function scope(printing: Printing, indent: string): Scope {
	return {
		declared: printing.declared,
		lazy: false,
		indent,
		uses: printing.uses,
		helpers: printing.codecs,
	};
}

/** `text`, noting whether it calls `z.` itself. */
export function note(printing: Printing, text: string): string {
	if (/\bz\./.test(text)) printing.zod = true;
	return text;
}

/** The media type alxia.ts declares out of several: JSON first, as alxia replies with it. */
export function preferred(content: readonly MediaIR[]): MediaIR | undefined {
	return (
		content.find((m) => m.mediaType.toLowerCase() === 'application/json') ??
		content.find((m) => m.kind === 'json') ??
		content[0]
	);
}
