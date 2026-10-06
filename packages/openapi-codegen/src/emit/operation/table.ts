/** The `operations` table of `operations.ts`: each operation as data, with its validators. */
import type { MediaIR, OperationIR } from '../../ir/types';
import { type EmitContext, type ParamGroup, paramGroups } from '../context';
import { jsString, list, propertyKey } from '../printer';
import { expr, type Scope } from '../zod';
import type { Helper } from './helpers';

/** `export const operations`, typed by `OperationSpec`; a location with no parameters reads with `none`. */
export function operationTable(
	ctx: EmitContext,
	helpers: Set<Helper>,
	scope: (indent: string) => Scope,
): string {
	const entries = ctx.ir.operations.map((operation) => {
		const groups = new Map(paramGroups(operation).map((g) => [g.target, g]));
		const validator = (target: ParamGroup['target']): string => {
			const group = groups.get(target);
			if (group) return `z${group.name}`;
			helpers.add('none');
			return 'none';
		};
		const parameters = operation.parameters.map(
			(param) =>
				`{ name: ${jsString(param.name)}, in: ${jsString(param.in)}, required: ${param.required}, explode: ${param.explode}, list: ${ctx.resolve(param.schema).kind === 'array'} }`,
		);
		const lines = [
			`\t${propertyKey(operation.operationId)}: {`,
			`\t\tmethod: ${jsString(operation.method)},`,
			`\t\tpath: ${jsString(operation.path)},`,
			`\t\thonoPath: ${jsString(operation.honoPath)},`,
			`\t\ttags: ${list('[', operation.tags.map(jsString), ']', '\t\t')},`,
			`\t\tparameters: ${list('[', parameters, ']', '\t\t')},`,
			`\t\tparam: ${validator('param')},`,
			`\t\tquery: ${validator('query')},`,
			`\t\theader: ${validator('header')},`,
		];
		if (operation.body) {
			const form = ctx.formOf(operation);
			const named = form && {
				media: form.media,
				validator: `z${operation.name}Form`,
			};
			lines.push(
				'\t\tbody: {',
				`\t\t\trequired: ${operation.body.required},`,
				`\t\t\tcontent: ${contentSpec(ctx, operation.body.content, scope, '\t\t\t', named)},`,
				'\t\t},',
			);
		}
		lines.push(
			`\t\tresponses: ${responsesSpec(ctx, operation, scope, '\t\t')},`,
			'\t},',
		);
		return lines.join('\n');
	});
	const body = entries.length === 0 ? '{}' : `{\n${entries.join('\n')}\n}`;
	return `export const operations: {\n\treadonly [K in keyof Operations]: OperationSpec<ClientOperations[K]>;\n} = ${body};`;
}

function contentSpec(
	ctx: EmitContext,
	content: readonly MediaIR[],
	scope: (indent: string) => Scope,
	indent: string,
	/** A media type whose validator is declared above the table. */
	named?: { media: MediaIR; validator: string },
): string {
	if (content.length === 0) return '{}';
	const inner = `${indent}\t`;
	const lines = content.map((media) => {
		const key = `${inner}${jsString(media.mediaType)}`;
		if (media.kind === 'jsonl' && media.item) {
			return `${key}: { kind: 'jsonl', item: ${expr(ctx, media.item, scope(inner))} },`;
		}
		if (media.kind === 'sse' && media.events) {
			const deeper = `${inner}\t\t`;
			const events = media.events.map(
				(event) =>
					`${deeper}${propertyKey(event.name)}: ${event.data ? expr(ctx, event.data, scope(deeper)) : 'null'},`,
			);
			return [
				`${key}: {`,
				`${inner}\tkind: 'sse',`,
				`${inner}\tevents: {`,
				...events,
				`${inner}\t},`,
				`${inner}},`,
			].join('\n');
		}
		const schema =
			named?.media === media
				? `, schema: ${named.validator}`
				: media.schema
					? `, schema: ${expr(ctx, media.schema, scope(inner))}`
					: '';
		return `${inner}${jsString(media.mediaType)}: { kind: ${jsString(media.kind)}${schema} },`;
	});
	return `{\n${lines.join('\n')}\n${indent}}`;
}

function responsesSpec(
	ctx: EmitContext,
	operation: OperationIR,
	scope: (indent: string) => Scope,
	indent: string,
): string {
	if (operation.responses.length === 0) return '{}';
	const inner = `${indent}\t`;
	const lines = operation.responses.map(
		(response) =>
			`${inner}${response.status}: ${contentSpec(ctx, response.content, scope, inner)},`,
	);
	return `{\n${lines.join('\n')}\n${indent}}`;
}
