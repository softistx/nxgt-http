/** `ClientOperations` in `types.ts`: what a client sends and gets back, per operation. */
import type { MediaIR, OperationIR } from '../../ir/types';
import { type EmitContext, paramGroups } from '../context';
import { docComment, jsString, propertyKey } from '../printer';
import { type } from '../types';
import { groupObject, operationDocs } from './read';
import { streamLine } from './stream-types';

/**
 * What a client sends and gets back, per operation, as `@nxgt/openapi-httpyz`
 * reads it: `args`, what a call takes after the `operationId`, and `reply`,
 * every reply the spec declares, decoded; `wire` is the same as JSON carries
 * it. Each is written out here so that a call costs TypeScript one lookup.
 */
export function clientOperationsType(ctx: EmitContext): string {
	const entries = ctx.ir.operations.map((operation) => {
		const indent = '\t\t';
		return [
			...docComment(operationDocs(operation), '\t'),
			`\t${propertyKey(operation.operationId)}: {`,
			`${indent}method: ${jsString(operation.method)};`,
			`${indent}path: ${jsString(operation.path)};`,
			`${indent}args: ${clientArgs(ctx, operation, indent)};`,
			`${indent}reply:${clientReplies(ctx, operation, false, indent)};`,
			`${indent}wire:${clientReplies(ctx, operation, true, indent)};`,
			...streamLine(ctx, operation, 'client', indent),
			'\t};',
		].join('\n');
	});
	const doc =
		'/** What a client sends and gets back: `args` after the operationId, and each declared `reply`. */';
	return entries.length === 0
		? `${doc}\nexport interface ClientOperations {}`
		: `${doc}\nexport interface ClientOperations {\n${entries.join('\n')}\n}`;
}

/** What a body of each kind is sent as, keyed as `c.req.valid()` reads it. */
const BODY_KEYS: Record<MediaIR['kind'], string> = {
	json: 'json',
	form: 'form',
	text: 'text',
	binary: 'body',
	// Only a reply is read an item at a time: a body of these kinds is text, or bytes.
	sse: 'text',
	jsonl: 'body',
};

/**
 * `[input]`, `[input?]` when nothing in it is required, or `[]` when the
 * operation takes nothing. The input holds each parameter location as the
 * caller writes it, defaults optional, and one body: a union when the spec
 * accepts several kinds.
 */
function clientArgs(
	ctx: EmitContext,
	operation: OperationIR,
	indent: string,
): string {
	const inner = `${indent}\t`;
	const groups = paramGroups(operation);
	const params = groups.map((group) => {
		const optional = group.params.some((p) => p.required) ? '' : '?';
		return `${inner}${group.target}${optional}: ${type(ctx, groupObject(group), true, inner)};`;
	});
	const { body } = operation;
	const kinds = [
		...new Map(
			(body?.content ?? []).map((media) => [media.kind, media]),
		).values(),
	];
	const bodyLine = (media: MediaIR): string => {
		const value =
			media.kind === 'binary' || !media.schema
				? media.kind === 'text'
					? 'string'
					: 'globalThis.Blob | ArrayBuffer | Uint8Array'
				: type(ctx, media.schema, true, inner);
		return `${inner}${BODY_KEYS[media.kind]}${body?.required ? '' : '?'}: ${value};`;
	};
	const inputs =
		kinds.length === 0
			? [params]
			: kinds.map((media) => [...params, bodyLine(media)]);
	if (inputs.every((lines) => lines.length === 0)) return '[]';
	const required =
		groups.some((group) => group.params.some((p) => p.required)) ||
		body?.required === true;
	const text = inputs
		.map((lines) => `{\n${lines.join('\n')}\n${indent}}`)
		.join(' | ');
	return `[input${required ? '' : '?'}: ${text}]`;
}

/**
 * Every declared reply as `{ status; type; data }`: decoded, or as JSON
 * carries it. Printed after the key's colon: a space, or a union on the
 * lines below.
 */
function clientReplies(
	ctx: EmitContext,
	operation: OperationIR,
	wire: boolean,
	indent: string,
): string {
	const inner = `${indent}\t`;
	const members = operation.responses.flatMap((response) => {
		if (response.content.length === 0) {
			return [
				`{ status: ${response.status}; type: undefined; data: undefined }`,
			];
		}
		return response.content.map((media) => {
			let data = 'globalThis.Blob';
			// A stream read whole: events as the text they came as, JSON lines as bytes.
			if (media.kind === 'text' || media.kind === 'sse') data = 'string';
			// Its fields are text: a client hands the form over as it came.
			if (media.kind === 'form') data = 'globalThis.FormData';
			else if (media.schema && media.kind !== 'binary') {
				const decoded = type(ctx, media.schema, false, inner);
				data = wire ? ctx.wire(media.schema, decoded) : decoded;
			} else if (media.kind === 'json') data = 'unknown';
			return `{ status: ${response.status}; type: ${jsString(media.mediaType)}; data: ${data} }`;
		});
	});
	if (members.length === 0) return ' never';
	if (members.length === 1) return ` ${members[0]}`;
	return members.map((member) => `\n${inner}| ${member}`).join('');
}
