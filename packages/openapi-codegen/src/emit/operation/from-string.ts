/**
 * The validators for what arrives as text — a parameter, a form field —
 * reading numbers and booleans out of it strictly. Each records the helpers
 * it uses in `helpers`, which `operations.ts` then declares.
 */
import type { ObjectNode, Scalar, SchemaNode } from '../../ir/types';
import { type EmitContext, type ParamGroup, paramKey } from '../context';
import { list, propertyKey } from '../printer';
import { bounds, expr, literal, type Scope, withDefault } from '../zod';
import type { Helper } from './helpers';
import { valueSchema } from './read';

/** A parameter location's validator: each parameter read from text, defaults applied. */
export function paramObject(
	ctx: EmitContext,
	group: ParamGroup,
	helpers: Set<Helper>,
	scope: (indent: string) => Scope,
): string {
	const entries = group.params.map((param) => {
		let value = fromString(ctx, valueSchema(param), helpers, scope('\t'));
		const fallback = param.schema.default;
		if (!param.required) {
			value +=
				fallback === undefined
					? '.optional()'
					: withDefault(ctx, param.schema, fallback.value);
		}
		return `\t${propertyKey(paramKey(param))}: ${value},`;
	});
	return `z.object({\n${entries.join('\n')}\n})`;
}

/**
 * A form body's validator. A form carries text and files, so each field is
 * read like a parameter, and a list field takes one value alone as a list of
 * one. The object keeps its unknown-key mode.
 */
export function formObject(
	ctx: EmitContext,
	object: ObjectNode,
	helpers: Set<Helper>,
	scope: (indent: string) => Scope,
	/** Where the object starts: its fields are a tab further in. */
	indent = '',
): string {
	const inner = `${indent}\t`;
	const entries = object.properties.map((property) => {
		let value = fromString(ctx, property.schema, helpers, scope(inner));
		if (ctx.resolve(property.schema).kind === 'array') {
			helpers.add('repeated');
			value = `z.preprocess(repeated, ${value})`;
		}
		const fallback = property.schema.default;
		if (!property.required) {
			value +=
				fallback === undefined
					? '.optional()'
					: withDefault(ctx, property.schema, fallback.value);
		}
		return `${inner}${propertyKey(property.name)}: ${value},`;
	});
	const mode = ctx.mode(object);
	const create =
		mode === 'strict'
			? 'z.strictObject'
			: mode === 'loose'
				? 'z.looseObject'
				: 'z.object';
	return entries.length === 0
		? `${create}({})`
		: `${create}({\n${entries.join('\n')}\n${indent}})`;
}

/**
 * The validator for a value that arrives as text — a path segment, a query
 * value, a header — reading numbers and booleans out of it strictly.
 */
export function fromString(
	ctx: EmitContext,
	node: SchemaNode,
	helpers: Set<Helper>,
	scope: Scope,
): string {
	const resolved = ctx.resolve(node);
	switch (resolved.kind) {
		case 'number':
			helpers.add('numeric');
			return `numeric.pipe(${expr(ctx, node, scope)})`;
		case 'boolean':
			helpers.add('flag');
			return node.kind === 'boolean'
				? 'flag'
				: `flag.pipe(${expr(ctx, node, scope)})`;
		case 'literal':
			return literalFromString(ctx, node, resolved.values, helpers, scope);
		case 'union': {
			const inner: Scope = { ...scope, indent: `${scope.indent}\t` };
			const variants = resolved.variants.map((variant) =>
				fromString(ctx, variant, helpers, inner),
			);
			return `z.union(${list('[', variants, ']', scope.indent)})`;
		}
		case 'array':
			return `z.array(${fromString(ctx, resolved.items, helpers, scope)})${bounds(resolved.minItems, resolved.maxItems)}`;
		default:
			return expr(ctx, node, scope);
	}
}

/** An enum of numbers is read as numbers, one of strings as it is, a mix as both. */
function literalFromString(
	ctx: EmitContext,
	node: SchemaNode,
	values: readonly Scalar[],
	helpers: Set<Helper>,
	scope: Scope,
): string {
	const pieces: string[] = [];
	const whole = expr(ctx, node, scope);
	for (const [kind, helper] of [
		['number', 'numeric'],
		['boolean', 'flag'],
		['string', undefined],
	] as const) {
		const some = values.filter((value) => typeof value === kind);
		if (some.length === 0) continue;
		const piece =
			some.length === values.length ? whole : literal(some, scope.indent);
		if (helper) helpers.add(helper);
		pieces.push(helper ? `${helper}.pipe(${piece})` : piece);
	}
	const [only] = pieces;
	return pieces.length === 1 && only !== undefined
		? only
		: `z.union(${list('[', pieces, ']', scope.indent)})`;
}
