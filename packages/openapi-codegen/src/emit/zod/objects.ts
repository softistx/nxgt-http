/**
 * An object schema: its own shape, the parents it extends, its mode for
 * the keys it does not declare, and the defaults of its properties.
 */
import { refsOf } from '../../ir/graph';
import type { ObjectNode, SchemaNode } from '../../ir/types';
import { appliesDefault, type EmitContext } from '../context';
import type { ObjectMode } from '../options';
import { jsValue, propertyKey } from '../printer';
import { expr, intersection } from './nodes';
import { named, reference, type Scope } from './scope';

const MODE_CALLS: Record<string, string> = {
	strip: '.strip()',
	strict: '.strict()',
	loose: '.loose()',
};

export function object(
	ctx: EmitContext,
	node: ObjectNode,
	scope: Scope,
): string {
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
