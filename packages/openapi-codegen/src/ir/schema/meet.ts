import type { SchemaNode } from '../types';

/** Rewrites `target` in place, keeping what it was annotated with. */
export function replaceNode(target: SchemaNode, next: SchemaNode): void {
	const { nullable, description, deprecated, readOnly, writeOnly } = target;
	const kept = Object.fromEntries(
		Object.entries({
			nullable,
			description,
			deprecated,
			readOnly,
			writeOnly,
			default: target.default,
		}).filter(([, value]) => value !== undefined),
	);
	const record = target as unknown as Record<string, unknown>;
	for (const key of Object.keys(record)) delete record[key];
	Object.assign(target, next, kept);
}

const ANNOTATED = [
	'description',
	'deprecated',
	'readOnly',
	'writeOnly',
	'default',
] as const;

/** `target`, given the annotations `from` has and it lacks. */
function annotated(target: SchemaNode, from: SchemaNode): SchemaNode {
	const copy = { ...target };
	for (const key of ANNOTATED) {
		if (copy[key] === undefined && from[key] !== undefined) {
			Object.assign(copy, { [key]: from[key] });
		}
	}
	return copy;
}

/**
 * What a value must be to hold both `a` and `b`, as `allOf` asks: one
 * scalar with the constraints of both when none clash, else their
 * intersection. Either way it keeps the annotations of both, a `default`
 * included, so a restated property still gets its parent's default.
 */
export function meet(a: SchemaNode, b: SchemaNode): SchemaNode {
	if (b.kind === 'unknown') return annotated(a, b);
	if (a.kind === 'unknown') return annotated(b, a);
	if (JSON.stringify(a) === JSON.stringify(b)) return a;
	return (
		merged(a, b) ??
		annotated(annotated({ kind: 'intersection', members: [a, b] }, a), b)
	);
}

const SCALARS = new Set(['string', 'number', 'boolean', 'null', 'binary']);

/**
 * `a` and `b`, scalars of one kind, as one node: every constraint of both,
 * `integer` if either says so, and `null` only when both let it through.
 * Nothing when they set one constraint to two values.
 */
function merged(a: SchemaNode, b: SchemaNode): SchemaNode | undefined {
	if (a.kind !== b.kind || !SCALARS.has(a.kind)) return undefined;
	const out: Record<string, unknown> = { ...a };
	for (const [key, value] of Object.entries(b)) {
		if (key === 'nullable' || (ANNOTATED as readonly string[]).includes(key)) {
			continue;
		}
		const mine = out[key];
		if (key === 'integer') out[key] = Boolean(mine) || Boolean(value);
		else if (mine === undefined) out[key] = value;
		else if (JSON.stringify(mine) !== JSON.stringify(value)) return undefined;
	}
	if (!(a.nullable && b.nullable)) delete out['nullable'];
	return annotated(out as unknown as SchemaNode, b);
}
