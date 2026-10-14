/**
 * The write side of the API: what a client may send. A `readOnly` property
 * is the server's to set, so a request body leaves it out.
 *
 * A schema that differs for writing is an object with a `readOnly` property,
 * or one that reaches such a schema, to a fixpoint. Only the schemas a
 * request body reaches are considered. One that is reached from nowhere else
 * is stripped in place; one that responses or parameters also use keeps its
 * node, and gets a copy `<id>#write`, named `<Name>Write`, right after it.
 * A `$ref` names the schema, never an alias, so aliases need no copy.
 *
 * The input is never changed, and the same object comes back when no body
 * reaches a `readOnly` property.
 */
import type { Diagnostics } from '../../errors';
import type { Location } from '../../loader/location';
import { refsOf } from '../graph';
import type { ApiIR, MediaIR, SchemaNode } from '../types';
import { isReadOnly, type WriteContext } from './context';
import { differs, findDiffering } from './differing';
import { keepDiscriminators } from './discriminators';
import { reachedSets } from './reach';
import { assemble, writeNode } from './rewrite';

export function writeViews(
	api: ApiIR,
	diagnostics: Diagnostics,
	overrideKey: (at: Location) => string,
): ApiIR {
	const named = new Map(api.schemas.map((s) => [s.id, s]));
	const bodies = api.operations.flatMap((operation) =>
		(operation.body?.content ?? []).flatMap((media) =>
			media.schema ? [{ operation, media, schema: media.schema }] : [],
		),
	);
	if (bodies.length === 0) return api;

	const whole = bodies.filter(({ schema }) => isReadOnly({ named }, schema));
	const blockedRefs = whole.flatMap(({ schema }) => refsOf(schema));
	const ctx: WriteContext = {
		named,
		diagnostics,
		bodies,
		kept: new WeakMap(),
		...reachedSets(api, bodies, blockedRefs, named),
		blocked: new Set(blockedRefs),
		differing: new Set(),
	};
	for (const { operation } of whole) {
		diagnostics.warning(
			'ignored',
			'a request body that is `readOnly` is kept: there is nothing to leave out of it',
			operation.location,
		);
	}
	keepDiscriminators(ctx);
	findDiffering(ctx);

	const sending = bodies.filter(
		(body) => !whole.includes(body) && differs(ctx, body.schema),
	);
	if (ctx.differing.size === 0 && sending.length === 0) return api;

	const taken = new Map<string, Location>([
		...api.schemas.map((s) => [s.name, s.location] as const),
		...api.aliases.map((a) => [a.name, a.location] as const),
	]);
	const schemas = assemble(ctx, api.schemas, taken, (name, source, other) => {
		diagnostics.error(
			'name_collision',
			`the write view of ${source.name} would be named ${name}, as is another schema (${overrideKey(other)}). ` +
				`Rename that one with the \`names\` option, e.g. names: { '${overrideKey(other)}': '${name}2' }`,
			source.location,
		);
	});

	const sent = new Map<MediaIR, SchemaNode>(
		sending.map(({ media, schema }) => [media, writeNode(ctx, schema)]),
	);
	const operations = api.operations.map((operation) =>
		operation.body?.content.some((m) => sent.has(m))
			? {
					...operation,
					body: {
						...operation.body,
						content: operation.body.content.map((m) => {
							const schema = sent.get(m);
							return schema ? { ...m, schema } : m;
						}),
					},
				}
			: operation,
	);
	return { ...api, schemas, operations };
}
