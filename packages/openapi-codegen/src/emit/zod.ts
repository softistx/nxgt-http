/**
 * `zod.ts`: one Zod 4 schema per named schema, `z<Name>`, in dependency
 * order.
 *
 * A schema in a reference cycle is annotated `z.ZodType<X, XInput>` (from
 * `types.ts`), which is what lets TypeScript type it at all; inside it, a
 * property that reaches a schema not initialized yet is a getter, and any
 * other such reference is `z.lazy()`.
 */
import { refsOf } from '../ir/graph';
import type {
	NumberNode,
	ObjectNode,
	Scalar,
	SchemaNode,
	StringFormat,
	StringNode,
	UnionNode,
} from '../ir/types';
import { appliesDefault, type EmitContext, type ObjectMode } from './context';
import {
	docComment,
	docLines,
	file,
	jsString,
	jsValue,
	list,
	propertyKey,
	regexLiteral,
} from './printer';

export interface Scope {
	/** Schemas whose `const` is initialized by the time this code runs. */
	declared: ReadonlySet<string>;
	/** Inside a getter, which runs only after every `const` is initialized. */
	lazy: boolean;
	indent: string;
	/** Collects the schemas referenced, for a file that imports them. */
	uses?: Set<string>;
	/** Collects the helpers used, for a file that declares them: `isoDate`. */
	helpers: Set<string>;
}

/** Declared by a file whose validators decode a `date-time`. */
export const ISO_DATE = [
	'/** An RFC 3339 date-time, decoded to a Date and encoded back. */',
	'const isoDate = {',
	'\tdecode: (value: string): Date => new Date(value),',
	'\tencode: (date: Date): string => date.toISOString(),',
	'};',
].join('\n');

const STRING_FORMATS: Record<StringFormat, string> = {
	// RFC 3339, as JSON Schema's date-time: the offset is mandatory.
	'date-time': 'z.iso.datetime({ offset: true })',
	date: 'z.iso.date()',
	// RFC 3339's full-time: seconds and an offset are mandatory, which
	// z.iso.time() gets the other way round.
	time: 'z.string().regex(/^(?:[01]\\d|2[0-3]):[0-5]\\d:(?:[0-5]\\d|60)(?:\\.\\d+)?(?:[Zz]|[+-](?:[01]\\d|2[0-3]):[0-5]\\d)$/)',
	duration: 'z.iso.duration()',
	email: 'z.email()',
	uri: 'z.url()',
	// z.uuid() also checks the RFC 9562 variant bits; JSON Schema's uuid is the shape.
	uuid: 'z.guid()',
	ipv4: 'z.ipv4()',
	ipv6: 'z.ipv6()',
	byte: 'z.base64()',
};

export function emitZod(ctx: EmitContext): string {
	const types = new Set<string>();
	/** The enum objects of `types.ts`, imported as values for `z.enum()`. */
	const values = new Set<string>();
	const declared = new Set<string>();
	const helpers = new Set<string>();
	const blocks: string[] = [];
	for (const schema of ctx.ir.schemas) {
		let annotation = '';
		if (schema.recursive) {
			const input = ctx.typeName(schema.id, true);
			types.add(schema.name).add(input);
			annotation = `: z.ZodType<${schema.name}, ${input}>`;
		}
		const scope: Scope = { declared, lazy: false, indent: '', helpers };
		const members = ctx.enumOf(schema.id);
		if (members) values.add(schema.name);
		const value = members
			? `z.enum(${schema.name})${members.nullable ? '.nullable()' : ''}`
			: expr(ctx, schema.node, scope);
		blocks.push(
			[
				...docComment(docLines(schema.node), ''),
				`export const z${schema.name}${annotation} = ${value};`,
			].join('\n'),
		);
		declared.add(schema.id);
	}
	for (const alias of ctx.ir.aliases) {
		blocks.push(
			`export const z${alias.name} = z${ctx.schema(alias.target).name};`,
		);
	}
	// A spec with no schema: no `z` to import, which an app's `noUnusedLocals`
	// refuses, but still a module, which `operations.ts` imports.
	if (blocks.length === 0) return file([ctx.header, 'export {};']);
	const imports = [`import { z } from 'zod';`];
	if (values.size > 0) {
		imports.push(
			`import ${list('{ ', [...values].sort(), ' }', '')} from './types${ctx.options.importExtension}';`,
		);
	}
	if (types.size > 0) {
		imports.push(
			`import type ${list('{ ', [...types].sort(), ' }', '')} from './types${ctx.options.importExtension}';`,
		);
	}
	return file([
		ctx.header,
		imports.join('\n'),
		...(helpers.has('isoDate') ? [ISO_DATE] : []),
		...blocks,
	]);
}

export function expr(ctx: EmitContext, node: SchemaNode, scope: Scope): string {
	const text = bare(ctx, node, scope);
	return node.nullable ? `${text}.nullable()` : text;
}

function bare(ctx: EmitContext, node: SchemaNode, scope: Scope): string {
	switch (node.kind) {
		case 'ref':
			return reference(ctx, node.target, scope);
		case 'string':
			return string(ctx, node, scope);
		case 'number':
			return number(node);
		case 'boolean':
			return 'z.boolean()';
		case 'null':
			return 'z.null()';
		case 'unknown':
			return 'z.unknown()';
		case 'never':
			return 'z.never()';
		case 'binary':
			return 'z.file()';
		case 'literal':
			return literal(node.values, scope.indent);
		case 'array':
			return `z.array(${expr(ctx, node.items, scope)})${bounds(node.minItems, node.maxItems)}`;
		case 'record':
			return `z.record(z.string(), ${expr(ctx, node.values, scope)})`;
		case 'union':
			return union(ctx, node, scope);
		case 'intersection':
			return intersection(node.members.map((m) => expr(ctx, m, scope)));
		case 'object':
			return object(ctx, node, scope);
	}
}

/** `zEmployee`, noted as used so the file that prints it can import it. */
function named(ctx: EmitContext, id: string, scope: Scope): string {
	scope.uses?.add(id);
	return `z${ctx.schema(id).name}`;
}

function reference(ctx: EmitContext, target: string, scope: Scope): string {
	const name = named(ctx, target, scope);
	return scope.lazy || scope.declared.has(target)
		? name
		: `z.lazy(() => ${name})`;
}

export const bounds = (min?: number, max?: number): string =>
	(min === undefined ? '' : `.min(${min})`) +
	(max === undefined ? '' : `.max(${max})`);

function string(ctx: EmitContext, node: StringNode, scope: Scope): string {
	let out = node.format ? STRING_FORMATS[node.format] : 'z.string()';
	out += bounds(node.minLength, node.maxLength);
	if (node.pattern !== undefined) {
		out += `.regex(${regexLiteral(node.pattern)})`;
	}
	if (!ctx.isDate(node)) return out;
	scope.helpers.add('isoDate');
	return `z.codec(${out}, z.date(), isoDate)`;
}

function number(node: NumberNode): string {
	let out = !node.integer
		? 'z.number()'
		: node.format === 'int32'
			? 'z.int32()'
			: // int64 too: a JSON number past 2^53 has already lost precision.
				'z.int()';
	if (node.minimum !== undefined) out += `.min(${node.minimum})`;
	if (node.exclusiveMinimum !== undefined) {
		out += `.gt(${node.exclusiveMinimum})`;
	}
	if (node.maximum !== undefined) out += `.max(${node.maximum})`;
	if (node.exclusiveMaximum !== undefined) {
		out += `.lt(${node.exclusiveMaximum})`;
	}
	if (node.multipleOf !== undefined) out += `.multipleOf(${node.multipleOf})`;
	return out;
}

export function literal(values: readonly Scalar[], indent: string): string {
	const [only] = values;
	if (values.length === 1 && only !== undefined) {
		return `z.literal(${jsValue(only)})`;
	}
	const items = list('[', values.map(jsValue), ']', indent);
	return values.every((value) => typeof value === 'string')
		? `z.enum(${items})`
		: `z.literal(${items})`;
}

function union(ctx: EmitContext, node: UnionNode, scope: Scope): string {
	const inner: Scope = { ...scope, indent: `${scope.indent}\t` };
	const options = list(
		'[',
		node.variants.map((variant) => expr(ctx, variant, inner)),
		']',
		scope.indent,
	);
	if (
		node.discriminator !== undefined &&
		node.variants.every((variant) => ctx.isZodObject(variant))
	) {
		return `z.discriminatedUnion(${jsString(node.discriminator)}, ${options})`;
	}
	return `z.union(${options})`;
}

const intersection = (members: readonly string[]): string =>
	members
		.slice(1)
		.reduce((out, member) => `${out}.and(${member})`, members[0] ?? '');

const MODE_CALLS: Record<string, string> = {
	strip: '.strip()',
	strict: '.strict()',
	loose: '.loose()',
};

function object(ctx: EmitContext, node: ObjectNode, scope: Scope): string {
	const mode = ctx.mode(node);
	const shape = shapeOf(ctx, node, scope);
	const [first, ...rest] = node.extends;
	if (first === undefined) return own(ctx, mode, shape, scope);
	if (
		node.extends.every((target) => ctx.isZodObject({ kind: 'ref', target }))
	) {
		let out = named(ctx, first, scope);
		for (const id of rest) out += `.extend(${named(ctx, id, scope)}.shape)`;
		if (shape !== '{}') out += `.extend(${shape})`;
		// `.extend()` keeps the first parent's mode; this object may want another.
		return out + restate(ctx, mode, ctx.modeOf(first), scope);
	}
	const members = node.extends.map((id) => reference(ctx, id, scope));
	// The shape holds the parents' properties that `required` names, which
	// only a lookup through the parents finds.
	if (shape !== '{}') members.push(own(ctx, mode, shape, scope));
	return intersection(members);
}

/** An object of `shape` alone, in `mode`. */
function own(
	ctx: EmitContext,
	mode: ObjectMode,
	shape: string,
	scope: Scope,
): string {
	if (typeof mode === 'object') {
		return `z.object(${shape}).catchall(${expr(ctx, mode.schema, scope)})`;
	}
	const factory =
		mode === 'strict'
			? 'z.strictObject'
			: mode === 'loose'
				? 'z.looseObject'
				: 'z.object';
	return `${factory}(${shape})`;
}

function restate(
	ctx: EmitContext,
	mode: ObjectMode,
	inherited: ObjectMode,
	scope: Scope,
): string {
	if (typeof mode === 'string') {
		return mode === inherited ? '' : (MODE_CALLS[mode] ?? '');
	}
	const catchall = expr(ctx, mode.schema, scope);
	if (
		typeof inherited === 'object' &&
		expr(ctx, inherited.schema, scope) === catchall
	) {
		return '';
	}
	return `.catchall(${catchall})`;
}

function shapeOf(ctx: EmitContext, node: ObjectNode, scope: Scope): string {
	const indent = `${scope.indent}\t`;
	const entries: string[] = [];
	for (const property of node.properties) {
		const presence = property.required
			? 'required'
			: appliesDefault(property)
				? 'default'
				: 'optional';
		entries.push(
			entry(ctx, property.name, property.schema, presence, scope, indent),
		);
	}
	for (const name of node.requires ?? []) {
		const inherited = ctx.propertyOf(node, name);
		if (inherited) {
			entries.push(
				entry(ctx, name, inherited.schema, 'required', scope, indent),
			);
		}
	}
	return entries.length === 0
		? '{}'
		: `{\n${entries.join('\n')}\n${scope.indent}}`;
}

function entry(
	ctx: EmitContext,
	name: string,
	schema: SchemaNode,
	presence: 'required' | 'optional' | 'default',
	scope: Scope,
	indent: string,
): string {
	const key = propertyKey(name);
	// A reference to a schema not initialized yet is read when Zod first needs it.
	const getter =
		!scope.lazy && refsOf(schema).some((id) => !scope.declared.has(id));
	const inner: Scope = {
		...scope,
		lazy: scope.lazy || getter,
		indent: getter ? `${indent}\t` : indent,
	};
	let value = expr(ctx, schema, inner);
	if (presence === 'optional') value += '.optional()';
	if (presence === 'default') {
		value += withDefault(ctx, schema, schema.default?.value);
	}
	if (!getter) return `${indent}${key}: ${value},`;
	return `${indent}get ${key}() {\n${indent}\treturn ${value};\n${indent}},`;
}

/**
 * `.default(value)`, or `.prefault(value)` when the schema returns something
 * other than it takes. The spec writes a default as JSON, an input, and
 * `.default()` hands it back unparsed: a date would stay a string, and an
 * object's own defaults would never be filled in.
 */
export function withDefault(
	ctx: EmitContext,
	schema: SchemaNode,
	value: unknown,
): string {
	const method =
		ctx.datesIn(schema) || ctx.inputDiffers(schema) ? 'prefault' : 'default';
	return `.${method}(${defaultValue(value)})`;
}

/** An object or array default is built afresh on each parse, so no caller shares it. */
export function defaultValue(value: unknown): string {
	if (Array.isArray(value)) return `() => ${jsValue(value)}`;
	if (typeof value === 'object' && value !== null) {
		return `() => (${jsValue(value)})`;
	}
	return jsValue(value);
}
