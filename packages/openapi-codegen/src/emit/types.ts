/**
 * The schema half of `types.gen.ts`: one TypeScript type per named schema,
 * and an `XInput` type beside it when its validator accepts something other
 * than what it returns. Nothing is imported; its only runtime values are the
 * `as const` objects of named enums, which `zod.gen.ts` reuses.
 */
import type {
	LiteralNode,
	NamedSchema,
	ObjectNode,
	Scalar,
	SchemaNode,
} from '../ir/types';
import { appliesDefault, type EmitContext } from './context';
import { docComment, docLines, group, jsString, propertyKey } from './printer';

/** Declared in `types.gen.ts` with `dates: 'date'`, for what JSON carries. */
export const WIRE_TYPE = `/** \`T\` as JSON carries it: a \`Date\` travels as its ISO string. */
export type Wire<T> = T extends Date
	? string
	: T extends globalThis.Blob
		? T
		: T extends object
			? { [K in keyof T]: Wire<T[K]> }
			: T;`;

export function schemaTypes(ctx: EmitContext): string[] {
	const blocks: string[] = [];
	for (const schema of ctx.ir.schemas) {
		blocks.push(declaration(ctx, schema, false));
		if (ctx.hasInput(schema.id)) blocks.push(declaration(ctx, schema, true));
	}
	for (const alias of ctx.ir.aliases) {
		if (ctx.enumOf(alias.target)) {
			blocks.push(
				`export const ${alias.name} = ${ctx.schema(alias.target).name};`,
			);
		}
		blocks.push(
			`export type ${alias.name} = ${ctx.typeName(alias.target, false)};`,
		);
		if (ctx.hasInput(alias.target)) {
			blocks.push(
				`export type ${alias.name}Input = ${ctx.typeName(alias.target, true)};`,
			);
		}
	}
	return blocks;
}

function declaration(
	ctx: EmitContext,
	schema: NamedSchema,
	input: boolean,
): string {
	const name = input ? `${schema.name}Input` : schema.name;
	const docs = input
		? [
				ctx.datesIn(schema.node)
					? `/** \`${schema.name}\` as its validator accepts it: dates as strings, defaults not filled in yet. */`
					: `/** \`${schema.name}\` as its validator accepts it, before defaults are filled in. */`,
			]
		: docComment(docLines(schema.node), '');
	const { node } = schema;
	const enumNode = ctx.enumOf(schema.id);
	if (enumNode) return enumDeclaration(name, enumNode, docs);
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
	if (ctx.mode(node) === 'loose') {
		lines.push(`${indent}[key: string]: unknown;`);
	}
	return lines;
}

/** The TypeScript type of `node`, as its validator returns it or, with `input`, accepts it. */
export function type(
	ctx: EmitContext,
	node: SchemaNode,
	input: boolean,
	indent: string,
): string {
	const text = bare(ctx, node, input, indent);
	return node.nullable ? `${text} | null` : text;
}

const literalType = (value: Scalar): string =>
	typeof value === 'string' ? jsString(value) : String(value);

/**
 * `export const X = { … } as const`, and `X` as the union of its values:
 * `z.enum(X)` validates against the same object, and plain literals still
 * type as `X`, which a TypeScript `enum` would refuse.
 */
function enumDeclaration(
	name: string,
	node: LiteralNode,
	docs: readonly string[],
): string {
	const keys = enumKeys(node);
	const members = node.values.map(
		(value, index) =>
			`\t${propertyKey(keys[index] ?? String(index))}: ${literalType(value)},`,
	);
	const union = `(typeof ${name})[keyof typeof ${name}]${node.nullable ? ' | null' : ''}`;
	return [
		...docs,
		`export const ${name} = {\n${members.join('\n')}\n} as const;`,
		...docs,
		`export type ${name} = ${union};`,
	].join('\n');
}

/**
 * The members' names: the spec's `x-enum-varnames`, else each value in
 * PascalCase (`on_leave` → `OnLeave`, `2` → `_2`), numbered on a clash.
 */
export function enumKeys(node: LiteralNode): string[] {
	if (node.names) return node.names;
	const used = new Set<string>();
	return node.values.map((value) => {
		const base =
			typeof value === 'number'
				? `_${String(value).replace('-', 'Minus').replace('.', '_')}`
				: memberName(String(value));
		let key = base;
		for (let n = 2; used.has(key); n++) key = `${base}${n}`;
		used.add(key);
		return key;
	});
}

function memberName(value: string): string {
	const name = value
		.split(/[^A-Za-z\d]+/)
		.filter(Boolean)
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join('');
	if (name === '') return 'Empty';
	return /^\d/.test(name) ? `_${name}` : name;
}

function bare(
	ctx: EmitContext,
	node: SchemaNode,
	input: boolean,
	indent: string,
): string {
	switch (node.kind) {
		case 'ref':
			return ctx.typeName(node.target, input);
		case 'string':
			return !input && ctx.isDate(node) ? 'Date' : 'string';
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
				.map((m) => group(type(ctx, m, input, indent), '|'))
				.join(' & ');
		case 'object':
			return objectType(ctx, node, input, indent);
	}
}

function objectType(
	ctx: EmitContext,
	node: ObjectNode,
	input: boolean,
	indent: string,
): string {
	const parts = node.extends.map((id) => ctx.typeName(id, input));
	const body = members(ctx, node, input, `${indent}\t`);
	if (body.length > 0) parts.push(`{\n${body.join('\n')}\n${indent}}`);
	else if (parts.length === 0) parts.push('{}');
	const mode = ctx.mode(node);
	if (typeof mode === 'object') {
		parts.push(`{ [key: string]: ${type(ctx, mode.schema, input, indent)} }`);
	}
	return parts.join(' & ');
}
