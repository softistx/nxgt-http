/** `Operations` in `types.ts`: what a handler gets, parameters and bodies as validated, and the replies. */
import type { MediaIR, OperationIR } from '../../ir/types';
import { type EmitContext, paramGroups } from '../context';
import { docComment, jsString, propertyKey } from '../printer';
import { type } from '../types';
import { operationDocs } from './read';
import { streamLine } from './stream-types';

export function operationsType(ctx: EmitContext): string {
	const entries = ctx.ir.operations.map((operation) =>
		operationEntry(ctx, operation),
	);
	return entries.length === 0
		? 'export interface Operations {}'
		: `export interface Operations {\n${entries.join('\n')}\n}`;
}

/** What a handler gets: parameters and bodies as validated, and the replies. */
function operationEntry(ctx: EmitContext, operation: OperationIR): string {
	const indent = '\t\t';
	const groups = new Map(paramGroups(operation).map((g) => [g.target, g]));
	const lines = [
		...docComment(operationDocs(operation), '\t'),
		`\t${propertyKey(operation.operationId)}: {`,
		`${indent}method: ${jsString(operation.method)};`,
		`${indent}path: ${jsString(operation.path)};`,
		`${indent}honoPath: ${jsString(operation.honoPath)};`,
	];
	for (const target of ['param', 'query', 'header'] as const) {
		lines.push(`${indent}${target}: ${groups.get(target)?.name ?? '{}'};`);
	}
	const { body } = operation;
	for (const kind of ['json', 'form'] as const) {
		const media = body?.content.find((m) => m.kind === kind);
		if (!body || !media?.schema) continue;
		const absent = body.required ? '' : ' | undefined';
		lines.push(
			`${indent}${kind}: ${type(ctx, media.schema, false, indent)}${absent};`,
		);
	}
	lines.push(
		`${indent}responses: ${responsesType(ctx, operation, indent)};`,
		...streamLine(ctx, operation, 'server', indent),
		'\t};',
	);
	return lines.join('\n');
}

function responsesType(
	ctx: EmitContext,
	operation: OperationIR,
	indent: string,
): string {
	if (operation.responses.length === 0) return '{}';
	const inner = `${indent}\t`;
	const lines = operation.responses.flatMap((response) => [
		...docComment(response.description ? [response.description] : [], inner),
		`${inner}${response.status}: ${contentType(ctx, response.content, inner)};`,
	]);
	return `{\n${lines.join('\n')}\n${indent}}`;
}

function contentType(
	ctx: EmitContext,
	content: readonly MediaIR[],
	indent: string,
): string {
	if (content.length === 0) return '{}';
	const inner = `${indent}\t`;
	const lines = content.map((media) => {
		const value = media.schema
			? type(ctx, media.schema, false, inner)
			: media.kind === 'sse'
				? 'string'
				: 'globalThis.Blob';
		return `${inner}${jsString(media.mediaType)}: ${value};`;
	});
	return `{\n${lines.join('\n')}\n${indent}}`;
}
