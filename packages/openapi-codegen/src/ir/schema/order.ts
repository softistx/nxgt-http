import { refsOf, stronglyConnected } from '../graph';
import type { NamedSchema } from '../types';

/**
 * Every named schema in emit order, a schema after those it refers to, each
 * marked `recursive` when it sits on a cycle of `$ref`s.
 */
export function emitOrder(named: Map<string, NamedSchema>): NamedSchema[] {
	const ids = [...named.keys()];
	const edges = new Map(
		ids.map((id) => [id, refsOf(named.get(id)?.node ?? { kind: 'unknown' })]),
	);
	const ordered: NamedSchema[] = [];
	for (const component of stronglyConnected(ids, (id) => edges.get(id) ?? [])) {
		const first = component[0] ?? '';
		const recursive =
			component.length > 1 || (edges.get(first) ?? []).includes(first);
		for (const id of component) {
			const schema = named.get(id);
			if (!schema) continue;
			schema.recursive = recursive;
			ordered.push(schema);
		}
	}
	return ordered;
}
