import type { Diagnostics } from '../errors';
import { refsOf } from './graph';
import { emitOrder } from './schema/order';
import type {
	ApiIR,
	MediaIR,
	NamedSchema,
	ObjectNode,
	SchemaNode,
} from './types';

/**
 * The write side of the API: what a client may send. A `readOnly` property
 * is the server's to set, so a request body leaves it out.
 *
 * A schema that differs for writing is an object with a `readOnly` property,
 * or one that reaches such a schema, to a fixpoint. Only the schemas a
 * request body reaches are considered. One that is reached from nowhere else
 * is stripped in place; one that responses or parameters also use keeps its
 * node, and gets a copy `<id>#write`, named `<Name>Write`, right after it.
 * Aliases get no copy, as they name their target.
 *
 * Nothing changes — not even the object — when no body reaches a `readOnly`
 * property.
 */
export function writeViews(api: ApiIR, diagnostics: Diagnostics): ApiIR {
	const named = new Map(api.schemas.map((s) => [s.id, s]));
	const bodies = api.operations.flatMap((operation) =>
		(operation.body?.content ?? []).flatMap((media) =>
			media.schema ? [{ operation, media, schema: media.schema }] : [],
		),
	);
	if (bodies.length === 0) return api;

	const reachedByBodies = reach(
		bodies.flatMap(({ schema }) => refsOf(schema)),
		named,
	);
	const reachedElsewhere = reach(
		[
			...api.operations.flatMap((operation) => [
				...[...operation.parameters, ...operation.cookies].flatMap((p) =>
					refsOf(p.schema),
				),
				...operation.responses.flatMap((r) => r.content.flatMap(mediaRefs)),
			]),
			// A schema no body reaches stays as it is, and keeps what it uses.
			...api.schemas
				.filter((s) => !reachedByBodies.has(s.id))
				.flatMap((s) => refsOf(s.node)),
		],
		named,
	);

	const resolveReadOnly = (node: SchemaNode): boolean => {
		let current = node;
		for (let hops = 0; hops < 64; hops++) {
			if (current.readOnly === true) return true;
			if (current.kind !== 'ref') return false;
			const target = named.get(current.target);
			if (!target) return false;
			current = target.node;
		}
		return false;
	};

	// A discriminator is how a client's union is told apart: it stays.
	const kept = new WeakMap<ObjectNode, Set<string>>();
	const warned = new Set<string>();
	const protect = (
		id: string,
		name: string,
		seen = new Set<string>(),
	): void => {
		if (seen.has(id)) return;
		seen.add(id);
		const schema = named.get(id);
		if (schema?.node.kind !== 'object') return;
		protectIn(schema, schema.node, name, seen);
	};
	const protectIn = (
		schema: NamedSchema | undefined,
		object: ObjectNode,
		name: string,
		seen: Set<string>,
	): void => {
		const own = object.properties.find((p) => p.name === name);
		if (own) {
			const set = kept.get(object) ?? new Set<string>();
			set.add(name);
			kept.set(object, set);
			if (resolveReadOnly(own.schema) && !warned.has(`${schema?.id}:${name}`)) {
				warned.add(`${schema?.id}:${name}`);
				diagnostics.warning(
					'ignored',
					`\`${name}\` is the discriminator of a union and \`readOnly\`: kept in what a client sends`,
					schema?.location,
				);
			}
		}
		for (const parent of object.extends) protect(parent, name, seen);
	};
	const scanUnions = (node: SchemaNode): void => {
		if (node.kind === 'union' && node.discriminator !== undefined) {
			for (const variant of node.variants) {
				if (variant.kind === 'ref') protect(variant.target, node.discriminator);
				else if (variant.kind === 'object') {
					protectIn(undefined, variant, node.discriminator, new Set());
				}
			}
		}
		for (const child of children(node)) scanUnions(child);
	};
	for (const { schema } of bodies) scanUnions(schema);
	for (const id of reachedByBodies) {
		const schema = named.get(id);
		if (schema) scanUnions(schema.node);
	}

	const dropped = (object: ObjectNode, name: string, schema: SchemaNode) =>
		resolveReadOnly(schema) && !kept.get(object)?.has(name);

	// A body that is itself `readOnly` is kept whole, with a warning below.
	const blocked = new Set(
		bodies
			.filter(({ schema }) => resolveReadOnly(schema))
			.flatMap(({ schema }) => refsOf(schema)),
	);
	const differing = new Set<string>();
	const differs = (node: SchemaNode): boolean => {
		switch (node.kind) {
			case 'ref':
				return differing.has(node.target);
			case 'array':
				return differs(node.items);
			case 'record':
				return differs(node.values);
			case 'union':
				return node.variants.some(differs);
			case 'intersection':
				return node.members.some(differs);
			case 'object':
				return (
					node.extends.some((id) => differing.has(id)) ||
					node.properties.some(
						(p) => dropped(node, p.name, p.schema) || differs(p.schema),
					) ||
					(typeof node.additional === 'object' &&
						differs(node.additional.schema))
				);
			default:
				return false;
		}
	};
	for (let changed = true; changed; ) {
		changed = false;
		for (const id of reachedByBodies) {
			const schema = named.get(id);
			if (!schema || blocked.has(id) || differing.has(id)) continue;
			if (!differs(schema.node)) continue;
			differing.add(id);
			changed = true;
		}
	}

	for (const { operation, schema } of bodies) {
		if (resolveReadOnly(schema)) {
			diagnostics.warning(
				'ignored',
				'a request body that is `readOnly` is kept: there is nothing to leave out of it',
				operation.location,
			);
		}
	}
	const sending = bodies.filter(
		({ schema }) => !resolveReadOnly(schema) && differs(schema),
	);
	if (differing.size === 0 && sending.length === 0) return api;

	const copied = (id: string) => differing.has(id) && reachedElsewhere.has(id);
	const names = new Set([
		...api.schemas.map((s) => s.name),
		...api.aliases.map((a) => a.name),
	]);
	const retarget = (id: string) => (copied(id) ? `${id}#write` : id);

	/** The names a parent's `readOnly` properties had, which `requires` can no longer ask for. */
	const droppedNames = (id: string, seen = new Set<string>()): Set<string> => {
		const out = new Set<string>();
		const object = named.get(id)?.node;
		if (object?.kind !== 'object' || seen.has(id)) return out;
		seen.add(id);
		for (const p of object.properties) {
			if (dropped(object, p.name, p.schema)) out.add(p.name);
		}
		for (const parent of object.extends) {
			for (const name of droppedNames(parent, seen)) out.add(name);
		}
		return out;
	};

	const write = (node: SchemaNode): SchemaNode => {
		if (!differs(node)) return node;
		switch (node.kind) {
			case 'ref':
				return { ...node, target: retarget(node.target) };
			case 'array':
				return { ...node, items: write(node.items) };
			case 'record':
				return { ...node, values: write(node.values) };
			case 'union':
				return { ...node, variants: node.variants.map(write) };
			case 'intersection':
				return { ...node, members: node.members.map(write) };
			case 'object': {
				const own = new Set(node.properties.map((p) => p.name));
				const gone = new Set(
					node.extends
						.flatMap((id) => [...droppedNames(id)])
						.filter((name) => !own.has(name)),
				);
				for (const p of node.properties) {
					if (dropped(node, p.name, p.schema)) gone.add(p.name);
				}
				const result: ObjectNode = {
					...node,
					properties: node.properties
						.filter((p) => !dropped(node, p.name, p.schema))
						.map((p) => ({ ...p, schema: write(p.schema) })),
					extends: node.extends.map(retarget),
				};
				if (typeof node.additional === 'object') {
					result.additional = { schema: write(node.additional.schema) };
				}
				if (node.requires) {
					const requires = node.requires.filter((name) => !gone.has(name));
					if (requires.length > 0) result.requires = requires;
					else delete result.requires;
				}
				return result;
			}
			default:
				return node;
		}
	};

	const next = new Map<string, NamedSchema>();
	for (const schema of api.schemas) {
		if (!differing.has(schema.id)) {
			next.set(schema.id, schema);
			continue;
		}
		const view = write(schema.node);
		if (!copied(schema.id)) {
			next.set(schema.id, { ...schema, node: view });
			continue;
		}
		next.set(schema.id, schema);
		const name = `${schema.name}Write`;
		if (names.has(name)) {
			diagnostics.error(
				'name_collision',
				`\`${name}\`, the write view of \`${schema.name}\`, is already the name of another schema`,
				schema.location,
			);
		}
		names.add(name);
		next.set(`${schema.id}#write`, {
			...schema,
			id: `${schema.id}#write`,
			name,
			node: view,
		});
	}
	for (const { media, schema } of sending) media.schema = write(schema);

	return { ...api, schemas: emitOrder(next) };
}

function mediaRefs(media: MediaIR): string[] {
	return [
		...(media.schema ? refsOf(media.schema) : []),
		...(media.item ? refsOf(media.item) : []),
		...(media.events ?? []).flatMap((e) => (e.data ? refsOf(e.data) : [])),
	];
}

/** Every named schema these ids lead to, themselves included. */
function reach(
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

function children(node: SchemaNode): SchemaNode[] {
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
