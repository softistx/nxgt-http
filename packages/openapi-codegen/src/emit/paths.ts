/**
 * `paths.ts`: the spec in the shape openapi-typescript prints, so
 * openapi-fetch, and anything else built on that shape, reads it unchanged.
 *
 * `paths` lists every method of every path, `?: never` where the spec has
 * none, and points at `operations`, keyed by `operationId`. Parameters and
 * request bodies are typed as a caller sends them, responses as the server
 * returns them, with the types of `types.ts`. With `dates: 'date'`,
 * responses and `components` go through `Wire<T>`: a client gets JSON, and
 * its dates are strings.
 */
import type { MediaIR, OperationIR, ParamIR, ParamLocation } from '../ir/types';
import type { EmitContext } from './context';
import { operationDocs, valueSchema } from './operations';
import {
	docComment,
	docLines,
	file,
	jsString,
	list,
	propertyKey,
} from './printer';
import { type } from './types';

/** The methods openapi-typescript lists on every path item. */
const METHODS = [
	'get',
	'put',
	'post',
	'delete',
	'options',
	'head',
	'patch',
	'trace',
] as const;

const LOCATIONS: readonly ParamLocation[] = ['query', 'header', 'path'];

export function emitPaths(ctx: EmitContext): string {
	const { value: sections, names } = ctx.collectTypes(() => [
		pathsType(ctx),
		'export type webhooks = Record<string, never>;',
		componentsType(ctx),
		'export type $defs = Record<string, never>;',
		operationsType(ctx),
	]);
	const imports =
		names.size === 0
			? []
			: [
					`import type ${list('{ ', [...names].sort(), ' }', '')} from './types${ctx.options.importExtension}';`,
				];
	return file([ctx.header, ...imports, ...sections]);
}

function pathsType(ctx: EmitContext): string {
	const byPath = new Map<string, OperationIR[]>();
	for (const operation of ctx.ir.operations) {
		const operations = byPath.get(operation.path) ?? [];
		operations.push(operation);
		byPath.set(operation.path, operations);
	}
	if (byPath.size === 0) return 'export interface paths {}';
	const entries = [...byPath].map(([path, operations]) => {
		const indent = '\t\t';
		// Every operation of a path has the same template, so the same path parameters.
		const shared =
			operations[0]?.parameters.filter((param) => param.in === 'path') ?? [];
		const lines = [
			`\t${jsString(path)}: {`,
			`${indent}parameters: ${parametersType(ctx, shared, indent)};`,
		];
		const methods: string[] = [...METHODS];
		// OpenAPI 3.2's QUERY, listed only where it is used: openapi-typescript has no slot for it.
		if (operations.some((operation) => operation.method === 'query')) {
			methods.push('query');
		}
		for (const method of methods) {
			const operation = operations.find((o) => o.method === method);
			if (!operation) {
				lines.push(`${indent}${method}?: never;`);
				continue;
			}
			lines.push(
				...docComment(operationDocs(operation), indent),
				`${indent}${method}: operations[${jsString(operation.operationId)}];`,
			);
		}
		lines.push('\t};');
		return lines.join('\n');
	});
	return `export interface paths {\n${entries.join('\n')}\n}`;
}

/** `query`, `header`, `path` and `cookie`: optional where nothing in it is required. */
function parametersType(
	ctx: EmitContext,
	params: readonly ParamIR[],
	indent: string,
): string {
	const inner = `${indent}\t`;
	const deeper = `${inner}\t`;
	const lines: string[] = [];
	for (const location of LOCATIONS) {
		const here = params.filter((param) => param.in === location);
		if (here.length === 0) {
			lines.push(`${inner}${location}?: never;`);
			continue;
		}
		const props = here.flatMap((param) => {
			const schema = valueSchema(param);
			return [
				...docComment(docLines(schema), deeper),
				`${deeper}${propertyKey(param.name)}${param.required ? '' : '?'}: ${type(ctx, schema, true, deeper)};`,
			];
		});
		const optional = here.some((param) => param.required) ? '' : '?';
		lines.push(
			`${inner}${location}${optional}: {\n${props.join('\n')}\n${inner}};`,
		);
	}
	lines.push(`${inner}cookie?: never;`);
	return `{\n${lines.join('\n')}\n${indent}}`;
}

/** A schema as JSON carries it, which is what openapi-fetch hands back. */
const wireName = (ctx: EmitContext, id: string): string =>
	ctx.wire({ kind: 'ref', target: id }, ctx.typeName(id, false));

function componentsType(ctx: EmitContext): string {
	const schemas = [
		...ctx.ir.schemas
			.filter((schema) => schema.source !== 'inline')
			.map(
				(schema) =>
					`\t\t${propertyKey(schema.name)}: ${wireName(ctx, schema.id)};`,
			),
		...ctx.ir.aliases.map(
			(alias) =>
				`\t\t${propertyKey(alias.name)}: ${wireName(ctx, alias.target)};`,
		),
	];
	return [
		'export interface components {',
		`\tschemas: ${schemas.length === 0 ? 'never' : `{\n${schemas.join('\n')}\n\t}`};`,
		'\tresponses: never;',
		'\tparameters: never;',
		'\trequestBodies: never;',
		'\theaders: never;',
		'\tpathItems: never;',
		'}',
	].join('\n');
}

function operationsType(ctx: EmitContext): string {
	if (ctx.ir.operations.length === 0) return 'export interface operations {}';
	const entries = ctx.ir.operations.map((operation) => {
		const indent = '\t\t';
		return [
			...docComment(operationDocs(operation), '\t'),
			`\t${propertyKey(operation.operationId)}: {`,
			`${indent}parameters: ${parametersType(ctx, operation.parameters, indent)};`,
			`${indent}${requestBodyType(ctx, operation, indent)}`,
			`${indent}responses: ${responsesType(ctx, operation, indent)};`,
			'\t};',
		].join('\n');
	});
	return `export interface operations {\n${entries.join('\n')}\n}`;
}

function requestBodyType(
	ctx: EmitContext,
	operation: OperationIR,
	indent: string,
): string {
	const { body } = operation;
	if (!body || body.content.length === 0) return 'requestBody?: never;';
	const inner = `${indent}\t`;
	return `requestBody${body.required ? '' : '?'}: {\n${inner}content: ${contentType(ctx, body.content, true, inner)};\n${indent}};`;
}

function responsesType(
	ctx: EmitContext,
	operation: OperationIR,
	indent: string,
): string {
	if (operation.responses.length === 0) return '{}';
	const inner = `${indent}\t`;
	const deeper = `${inner}\t`;
	const lines = operation.responses.flatMap((response) => [
		...docComment(response.description ? [response.description] : [], inner),
		`${inner}${response.status}: {`,
		`${deeper}headers: {\n${deeper}\t[name: string]: unknown;\n${deeper}};`,
		response.content.length === 0
			? `${deeper}content?: never;`
			: `${deeper}content: ${contentType(ctx, response.content, false, deeper)};`,
		`${inner}};`,
	]);
	return `{\n${lines.join('\n')}\n${indent}}`;
}

function contentType(
	ctx: EmitContext,
	content: readonly MediaIR[],
	input: boolean,
	indent: string,
): string {
	const inner = `${indent}\t`;
	const lines = content.map((media) => {
		const { schema } = media;
		// A response is typed as JSON carries it: openapi-fetch decodes no date.
		const value = !schema
			? 'globalThis.Blob'
			: input
				? type(ctx, schema, true, inner)
				: ctx.wire(schema, type(ctx, schema, false, inner));
		return `${inner}${jsString(media.mediaType)}: ${value};`;
	});
	return `{\n${lines.join('\n')}\n${indent}}`;
}
