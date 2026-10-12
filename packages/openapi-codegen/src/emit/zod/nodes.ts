/** Each kind of schema node, printed as the Zod 4 expression that validates it. */
import type {
	NumberNode,
	Scalar,
	SchemaNode,
	StringFormat,
	StringNode,
	UnionNode,
} from '../../ir/types';
import type { EmitContext } from '../context';
import { exactNumber, exactString, printsWithoutZ } from '../nxgt-zod';
import { jsString, jsValue, list, regexLiteral } from '../printer';
import { object } from './objects';
import { reference, type Scope } from './scope';

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

export function expr(ctx: EmitContext, node: SchemaNode, scope: Scope): string {
	const text = bare(ctx, node, scope);
	if (callsZ(ctx, node, scope)) scope.imports.add('z');
	return node.nullable ? `${text}.nullable()` : text;
}

/** Whether the printed node calls `z`: a reference, or a bare `@nxgt/zod` schema, does not. */
const callsZ = (ctx: EmitContext, node: SchemaNode, scope: Scope): boolean =>
	node.kind === 'ref'
		? !(scope.lazy || scope.declared.has(node.target))
		: !printsWithoutZ(ctx.options, node);

function bare(ctx: EmitContext, node: SchemaNode, scope: Scope): string {
	switch (node.kind) {
		case 'ref':
			return reference(ctx, node.target, scope);
		case 'string':
			return string(ctx, node, scope);
		case 'number':
			return exactNumber(ctx.options, node, scope.imports) ?? number(node);
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

export const bounds = (min?: number, max?: number): string =>
	(min === undefined ? '' : `.min(${min})`) +
	(max === undefined ? '' : `.max(${max})`);

function string(ctx: EmitContext, node: StringNode, scope: Scope): string {
	const exact = exactString(ctx.options, node, scope.imports);
	if (exact !== undefined) return exact;
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

export const intersection = (members: readonly string[]): string =>
	members
		.slice(1)
		.reduce((out, member) => `${out}.and(${member})`, members[0] ?? '');
