import type { SchemaNode } from './types';

/**
 * Tarjan's strongly connected components. Each component is complete only
 * after every component it reaches, so the result is in dependency order:
 * emitting it front to back never uses a schema before it is declared, and a
 * component of more than one node — or a node that reaches itself — is a
 * cycle that has to be built lazily.
 */
export function stronglyConnected(
	nodes: readonly string[],
	edges: (node: string) => readonly string[],
): string[][] {
	let next = 0;
	const index = new Map<string, number>();
	const low = new Map<string, number>();
	const stack: string[] = [];
	const onStack = new Set<string>();
	const components: string[][] = [];

	const visit = (node: string): void => {
		index.set(node, next);
		low.set(node, next);
		next++;
		stack.push(node);
		onStack.add(node);
		for (const target of edges(node)) {
			if (!index.has(target)) {
				visit(target);
				low.set(node, Math.min(low.get(node) ?? 0, low.get(target) ?? 0));
			} else if (onStack.has(target)) {
				low.set(node, Math.min(low.get(node) ?? 0, index.get(target) ?? 0));
			}
		}
		if (low.get(node) !== index.get(node)) return;
		const component: string[] = [];
		for (;;) {
			const member = stack.pop();
			if (member === undefined) break;
			onStack.delete(member);
			component.push(member);
			if (member === node) break;
		}
		components.push(component.reverse());
	};

	for (const node of nodes) if (!index.has(node)) visit(node);
	return components;
}

/** Every named schema a node points at, directly or through its children. */
export function refsOf(node: SchemaNode, into: string[] = []): string[] {
	switch (node.kind) {
		case 'ref':
			into.push(node.target);
			break;
		case 'array':
			refsOf(node.items, into);
			break;
		case 'record':
			refsOf(node.values, into);
			break;
		case 'object':
			into.push(...node.extends);
			for (const property of node.properties) refsOf(property.schema, into);
			if (typeof node.additional === 'object') {
				refsOf(node.additional.schema, into);
			}
			break;
		case 'union':
			for (const variant of node.variants) refsOf(variant, into);
			break;
		case 'intersection':
			for (const member of node.members) refsOf(member, into);
			break;
	}
	return into;
}
