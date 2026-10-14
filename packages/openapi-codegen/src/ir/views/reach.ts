/**
 * Which named schemas the roots reach, and which the rest of the API does:
 * only the second kind forces a schema the roots reach to be copied rather
 * than stripped in place.
 */

import { refsOf } from '../graph';
import type { ApiIR, NamedSchema, SchemaNode } from '../types';
import { type Direction, mediaRefs, type Root } from './direction';

/** Every named schema these ids lead to, themselves included. */
export function reach(
	start: readonly string[],
	named: ReadonlyMap<string, NamedSchema>,
): Set<string> {
	const seen = new Set<string>();
	const todo = [...start];
	for (let id = todo.pop(); id !== undefined; id = todo.pop()) {
		if (seen.has(id)) continue;
		seen.add(id);
		const schema = named.get(id);
		if (schema) todo.push(...refsOf(schema.node));
	}
	return seen;
}

/** What a node holds directly, for walking it. */
export function children(node: SchemaNode): SchemaNode[] {
	switch (node.kind) {
		case 'array':
			return [node.items];
		case 'record':
			return [node.values];
		case 'union':
			return node.variants;
		case 'intersection':
			return node.members;
		case 'object':
			return [
				...node.properties.map((p) => p.schema),
				...(typeof node.additional === 'object'
					? [node.additional.schema]
					: []),
			];
		default:
			return [];
	}
}

/**
 * `byRoots`: reached from the direction's media. `elsewhere`: reached from
 * a parameter, the other direction's media, a schema no root reaches, or a
 * root that is kept whole (`blockedRefs`) — all of which see the schema as
 * it is. `before` is the API as it was before an earlier pass moved its
 * media onto views of their own: the other direction is read from it, so
 * that a schema which bodies used keeps counting as shared.
 */
export function reachedSets(
	api: ApiIR,
	before: ApiIR,
	direction: Direction,
	roots: readonly Root[],
	blockedRefs: readonly string[],
	named: ReadonlyMap<string, NamedSchema>,
): { byRoots: Set<string>; elsewhere: Set<string> } {
	const byRoots = reach(
		roots.flatMap(({ node }) => refsOf(node)),
		named,
	);
	const elsewhere = reach(
		[
			...blockedRefs,
			...before.operations.flatMap((operation) => [
				...[...operation.parameters, ...operation.cookies].flatMap((p) =>
					refsOf(p.schema),
				),
				...direction.opposite(operation).flatMap(mediaRefs),
			]),
			...api.schemas
				.filter((s) => !byRoots.has(s.id))
				.flatMap((s) => refsOf(s.node)),
		],
		named,
	);
	return { byRoots, elsewhere };
}
