/**
 * The two sides of the API, each with the schemas it may see: what a client
 * sends has no `readOnly` property (the server sets it), what a server
 * replies has no `writeOnly` one (the client sets it). `views` runs one
 * direction (`WRITE` for request bodies, `READ` for replies); `buildIR` runs
 * both, so a schema with both kinds of property gets both views.
 *
 * A schema that differs for a direction is an object with a property to
 * leave out, or one that reaches such a schema, to a fixpoint. Only the
 * schemas the direction's media reach are considered. One that is reached
 * from nowhere else is stripped in place; one that the other direction or
 * the parameters also use keeps its node, and gets a copy `<id>#write` named
 * `<Name>Write` (or `<id>#read`, `<Name>Read`) right after it. A `$ref`
 * names the schema, never an alias, so aliases need no copy.
 *
 * The input is never changed, and the same object comes back when no root
 * reaches a property to leave out.
 */
import type { Diagnostics } from '../../errors';
import type { Location } from '../../loader/location';
import { refsOf } from '../graph';
import type { ApiIR, SchemaNode } from '../types';
import { isMarked, type ViewContext } from './context';
import { differs, findDiffering } from './differing';
import { type Direction, mapNodes, type Root, rootsOf } from './direction';
import { keepDiscriminators } from './discriminators';
import { reachedSets } from './reach';
import { assemble, viewNode } from './rewrite';

export { READ, WRITE } from './direction';

const MARKED_ROOT = (d: Direction) =>
	`a ${d.root} that is \`${d.mark}\` is kept: there is nothing to leave out of it`;

/** The shared state of a run, with the roots that are marked themselves (kept whole). */
function makeContext(
	api: ApiIR,
	before: ApiIR,
	direction: Direction,
	roots: Root[],
	diagnostics: Diagnostics,
): { ctx: ViewContext; whole: Root[] } {
	const named = new Map(api.schemas.map((s) => [s.id, s]));
	const whole = roots.filter(({ node }) =>
		isMarked({ named, direction }, node),
	);
	const blockedRefs = whole.flatMap(({ node }) => refsOf(node));
	const ctx: ViewContext = {
		direction,
		named,
		diagnostics,
		roots,
		kept: new WeakMap(),
		...reachedSets(api, before, direction, roots, blockedRefs, named),
		blocked: new Set(blockedRefs),
		differing: new Set(),
	};
	return { ctx, whole };
}

/** A root that is marked itself has nothing to leave out: say so. */
function warnWhole(ctx: ViewContext, whole: readonly Root[]): void {
	for (const { operation } of whole) {
		ctx.diagnostics.warning(
			'ignored',
			MARKED_ROOT(ctx.direction),
			operation.location,
		);
	}
}

/** The schemas with their views in place; a clashing view name is an error. */
function assembleViews(
	ctx: ViewContext,
	api: ApiIR,
	overrideKey: (at: Location) => string,
): ApiIR['schemas'] {
	const taken = new Map<string, Location>([
		...api.schemas.map((s) => [s.name, s.location] as const),
		...api.aliases.map((a) => [a.name, a.location] as const),
	]);
	return assemble(ctx, api.schemas, taken, (name, source, other) => {
		ctx.diagnostics.error(
			'name_collision',
			`the ${ctx.direction.tag} view of ${source.name} would be named ${name}, as is another schema (${overrideKey(other)}). ` +
				`Rename that one with the \`names\` option, e.g. names: { '${overrideKey(other)}': '${name}2' }`,
			source.location,
		);
	});
}

/**
 * `api` seen from `direction`. `before`: the API as it was before an earlier
 * pass (default `api`), whose other-direction media decide which schemas are
 * shared.
 */
export function views(
	api: ApiIR,
	direction: Direction,
	diagnostics: Diagnostics,
	overrideKey: (at: Location) => string,
	before: ApiIR = api,
): ApiIR {
	const roots = rootsOf(api, direction);
	if (roots.length === 0) return api;

	const { ctx, whole } = makeContext(
		api,
		before,
		direction,
		roots,
		diagnostics,
	);
	warnWhole(ctx, whole);
	keepDiscriminators(ctx);
	findDiffering(ctx);

	const isWhole = (node: SchemaNode) => whole.some((w) => w.node === node);
	const sending = roots.filter(
		({ node }) => !isWhole(node) && differs(ctx, node),
	);
	if (ctx.differing.size === 0 && sending.length === 0) return api;

	const schemas = assembleViews(ctx, api, overrideKey);
	const view = (node: SchemaNode) =>
		isWhole(node) ? node : viewNode(ctx, node);
	const operations = api.operations.map((operation) =>
		direction.mapMedia(operation, (media) => mapNodes(media, view)),
	);
	return { ...api, schemas, operations };
}
