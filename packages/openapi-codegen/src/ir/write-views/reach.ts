/**
 * Which named schemas the request bodies reach, and which the rest of the
 * API does: only the second kind forces a body-only schema to be copied
 * rather than stripped in place.
 */

import { refsOf } from '../graph';
import type { ApiIR, MediaIR, NamedSchema, SchemaNode } from '../types';
import type { BodySchema } from './context';

/** The ids a media type's schema, items and events point at. */
export function mediaRefs(media: MediaIR): string[] {
	return [
		...(media.schema ? refsOf(media.schema) : []),
		...(media.item ? refsOf(media.item) : []),
		...(media.events ?? []).flatMap((e) => (e.data ? refsOf(e.data) : [])),
	];
}

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
 * `byBodies`: reached from a request body. `elsewhere`: reached from a
 * parameter, a reply, a schema no body reaches, or a body that is kept whole
 * (`blockedRefs`) — all of which see the schema as it is.
 */
export function reachedSets(
	api: ApiIR,
	bodies: readonly BodySchema[],
	blockedRefs: readonly string[],
	named: ReadonlyMap<string, NamedSchema>,
): { byBodies: Set<string>; elsewhere: Set<string> } {
	const byBodies = reach(
		bodies.flatMap(({ schema }) => refsOf(schema)),
		named,
	);
	const elsewhere = reach(
		[
			...blockedRefs,
			...api.operations.flatMap((operation) => [
				...[...operation.parameters, ...operation.cookies].flatMap((p) =>
					refsOf(p.schema),
				),
				...operation.responses.flatMap((r) => r.content.flatMap(mediaRefs)),
			]),
			...api.schemas
				.filter((s) => !byBodies.has(s.id))
				.flatMap((s) => refsOf(s.node)),
		],
		named,
	);
	return { byBodies, elsewhere };
}
