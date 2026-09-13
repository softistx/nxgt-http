/**
 * `types.gen.ts`: one TypeScript type per named schema, and an `XInput` type
 * beside it when its validator accepts something other than what it returns.
 * Nothing is imported, so the file costs a consumer nothing at runtime.
 */
import type { NamedSchema, ObjectNode, Scalar, SchemaNode } from '../ir/types';
import { appliesDefault, type EmitContext } from './context';
import {
	docComment,
	docLines,
	file,
	group,
	jsString,
	propertyKey,
} from './printer';

export function emitTypes(ctx: EmitContext): string {
	const blocks: string[] = [];
	for (const schema of ctx.ir.schemas) {
		blocks.push(declaration(ctx, schema, false));
		if (ctx.hasInput(schema.id)) blocks.push(declaration(ctx, schema, true));
	}
	for (const alias of ctx.ir.aliases) {
		blocks.push(
			`export type ${alias.name} = ${ctx.typeName(alias.target, false)};`,
		);
		if (ctx.hasInput(alias.target)) {
			blocks.push(
				`export type ${alias.name}Input = ${ctx.typeName(alias.target, true)};`,
			);
		}
	}
	return file([ctx.header, ...blocks]);
}

function declaration(
	ctx: EmitContext,
	schema: NamedSchema,
	input: boolean,
): string {
	const name = input ? `${schema.name}Input` : schema.name;
	const docs = input
		? [
				`/** \`${schema.name}\` as its validator accepts it, before defaults are filled in. */`,
			]
		: docComment(docLines(schema.node), '');
	const { node } = schema;
	// An interface where one can be written: it names itself in errors and hovers.
	if (
		node.kind === 'object' &&
		!node.nullable &&
		typeof ctx.mode(node) === 'string'
	) {
		const parents = node.extends.map((id) => ctx.typeName(id, input));
		const head = `export interface ${name}${parents.length > 0 ? ` extends ${parents.join(', ')}` : ''}`;
		const body = members(ctx, node, input, '\t');
		const block =
			body.length === 0 ? `${head} {}` : `${head} {\n${body.join('\n')}\n}`;
		return [...docs, block].join('\n');
	}
	return [...docs, `export type ${name} = ${type(ctx, node, input, '')};`].join(
		'\n',
	);
}

function members(
	ctx: EmitContext,
	node: ObjectNode,
	input: boolean,
	indent: string,
	member = false,
): string[] {
	const lines: string[] = [];
	for (const property of node.properties) {
		const optional = input
			? !property.required
			: !property.required && !appliesDefault(property);
		const value = type(ctx, property.schema, input, indent);
		lines.push(
			...docComment(docLines(property.schema), indent),
			`${indent}${propertyKey(property.name)}${optional ? '?' : ''}: ${value}${optional ? ' | undefined' : ''};`,
		);
	}
	for (const name of node.requires ?? []) {
		const inherited = ctx.propertyOf(node, name);
		if (!inherited) continue;
		lines.push(
			`${indent}${propertyKey(name)}: ${type(ctx, inherited.schema, input, indent)};`,
		);
	}
	if (ctx.mode(node, member) === 'loose') {
		lines.push(`${indent}[key: string]: unknown;`);
	}
	return lines;
}

function type(
	ctx: EmitContext,
	node: SchemaNode,
	input: boolean,
	indent: string,
	member = false,
): string {
	const text = bare(ctx, node, input, indent, member);
	return node.nullable ? `${text} | null` : text;
}

const literalType = (value: Scalar): string =>
	typeof value === 'string' ? jsString(value) : String(value);

function bare(
	ctx: EmitContext,
	node: SchemaNode,
	input: boolean,
	indent: string,
	member: boolean,
): string {
	switch (node.kind) {
		case 'ref':
			return ctx.typeName(node.target, input);
		case 'string':
			return 'string';
		case 'number':
			return 'number';
		case 'binary':
			// A spec may well have a schema called File of its own.
			return 'globalThis.File';
		case 'boolean':
		case 'null':
		case 'unknown':
		case 'never':
			return node.kind;
		case 'literal':
			return node.values.map(literalType).join(' | ');
		case 'array':
			return `${group(type(ctx, node.items, input, indent))}[]`;
		case 'record':
			return `{ [key: string]: ${type(ctx, node.values, input, indent)} }`;
		case 'union':
			return node.variants
				.map((variant) => type(ctx, variant, input, indent))
				.join(' | ');
		case 'intersection':
			return node.members
				.map((m) => group(type(ctx, m, input, indent, true), '|'))
				.join(' & ');
		case 'object':
			return objectType(ctx, node, input, indent, member);
	}
}

function objectType(
	ctx: EmitContext,
	node: ObjectNode,
	input: boolean,
	indent: string,
	member: boolean,
): string {
	const parts = node.extends.map((id) => ctx.typeName(id, input));
	const body = members(ctx, node, input, `${indent}\t`, member);
	if (body.length > 0) parts.push(`{\n${body.join('\n')}\n${indent}}`);
	else if (parts.length === 0) parts.push('{}');
	const mode = ctx.mode(node, member);
	if (typeof mode === 'object') {
		parts.push(`{ [key: string]: ${type(ctx, mode.schema, input, indent)} }`);
	}
	return parts.join(' & ');
}
