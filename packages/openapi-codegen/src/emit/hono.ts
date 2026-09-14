/**
 * `hono.ts`, with the `hono` option: every operation's replies as Hono
 * types them, and `createApi` / `createRoutes` bound to the spec. The one
 * generated file that imports more than `zod`: `hono`, and this package's
 * `/hono` runtime.
 */

import type { MediaIR, OperationIR, ResponseIR } from '../ir/types';
import type { EmitContext } from './context';
import { operationDocs } from './operations';
import { docComment, file, list, propertyKey } from './printer';
import { unroutable } from './routable';
import { type } from './types';

/** The statuses Hono's `StatusCode` names. */
const STATUSES = new Set([
	100, 101, 102, 103, 200, 201, 202, 203, 204, 205, 206, 207, 208, 226, 300,
	301, 302, 303, 304, 305, 306, 307, 308, 400, 401, 402, 403, 404, 405, 406,
	407, 408, 409, 410, 411, 412, 413, 414, 415, 416, 417, 418, 421, 422, 423,
	424, 425, 426, 428, 429, 431, 451, 500, 501, 502, 503, 504, 505, 506, 507,
	508, 510, 511,
]);

/** What `c.redirect()` sends. 304 is not a redirect. */
const REDIRECTS = new Set([300, 301, 302, 303, 305, 306, 307, 308]);

const RUNTIME = '@nxgt/openapi-hono';

/** The indexes of `types.ts` that `HonoSpec` gathers. */
const INDEXES = [
	'Operations',
	'OperationsByRoute',
	'OperationsByTag',
	'PathsByMethod',
	'PathsByTag',
];

export function emitHono(ctx: EmitContext): string {
	for (const operation of ctx.ir.operations) {
		const why = unroutable(operation);
		if (why === undefined) continue;
		ctx.warnings.push({
			severity: 'warning',
			code: 'ignored',
			message: `${operation.operationId}: routes cannot register it. ${why}`,
			file: operation.location.file,
			pointer: operation.location.pointer,
		});
	}
	const { value: entries, names } = ctx.collectTypes(() =>
		ctx.ir.operations.map((operation) => repliesEntry(ctx, operation)),
	);
	const ext = ctx.options.importExtension;
	const types = [...new Set([...names, ...INDEXES])].sort();
	const imports = [
		"import type * as Hono from 'hono';",
		`import * as runtime from '${RUNTIME}';`,
		`import { operations } from './operations${ext}';`,
		`import type ${list('{ ', types, ' }', '')} from './types${ext}';`,
	].join('\n');
	const replies = [
		'/** What each operation may reply: a handler returning anything else does not compile. */',
		entries.length === 0
			? 'export interface Replies {}'
			: `export interface Replies {\n${entries.join('\n')}\n}`,
	].join('\n');
	return file([
		ctx.header,
		imports,
		replies,
		`/** The spec, as \`${RUNTIME}\` reads it. */
export interface HonoSpec {
	operations: Operations;
	replies: Replies;
	routes: OperationsByRoute;
	paths: PathsByMethod;
	tags: OperationsByTag;
	tagPaths: PathsByTag;
}`,
		`/**
 * One registry for the whole spec: \`api.routes(app)\` in each module, then
 * \`api.assertComplete()\` once every module is registered.
 */
export const createApi = (
	options?: runtime.ApiOptions,
): runtime.Api<HonoSpec> => runtime.createApi<HonoSpec>(operations, options);`,
		`/** Routes on one app, with a registry of their own. */
export const createRoutes = <
	Prefix extends string = '',
	Tag extends keyof OperationsByTag & string = never,
>(
	app: Hono.Hono<any, any, any>,
	options?: runtime.RoutesOptions<Prefix, Tag>,
): runtime.Routes<HonoSpec, runtime.ScopeOf<HonoSpec, Tag>, Prefix> =>
	createApi(options).routes(app, options);`,
	]);
}

function repliesEntry(ctx: EmitContext, operation: OperationIR): string {
	const indent = '\t\t';
	const members = [
		...new Set(
			operation.responses.flatMap((response) =>
				replyTypes(ctx, operation, response, indent),
			),
		),
	];
	const key = `\t${propertyKey(operation.operationId)}:`;
	const docs = docComment(operationDocs(operation), '\t');
	// Only `default` or ranges: no exact status to hold a reply to.
	if (members.length === 0) return [...docs, `${key} Response;`].join('\n');
	if (members.length === 1)
		return [...docs, `${key} ${members[0]};`].join('\n');
	return [
		...docs,
		key,
		...members.map(
			(member, i) =>
				`${indent}| ${member}${i === members.length - 1 ? ';' : ''}`,
		),
	].join('\n');
}

function replyTypes(
	ctx: EmitContext,
	operation: OperationIR,
	response: ResponseIR,
	indent: string,
): string[] {
	let status = String(response.status);
	if (!STATUSES.has(response.status)) {
		status = 'any';
		ctx.warnings.push({
			severity: 'warning',
			code: 'not_enforced',
			message: `${operation.operationId}: Hono has no type for status ${response.status}, so its replies are typed with any status`,
			file: response.location.file,
			pointer: response.location.pointer,
		});
	}
	if (response.content.length === 0) {
		const replies = [`Hono.TypedResponse<null, ${status}, 'body'>`];
		if (REDIRECTS.has(response.status)) {
			replies.push(`Hono.TypedResponse<undefined, ${status}, 'redirect'>`);
		}
		return replies;
	}
	return response.content.map((media) => replyType(ctx, media, status, indent));
}

function replyType(
	ctx: EmitContext,
	media: MediaIR,
	status: string,
	indent: string,
): string {
	// As JSON carries it: `c.json()` types a Date it is given as a string.
	const body = (fallback: string) =>
		media.schema
			? ctx.wire(media.schema, type(ctx, media.schema, false, indent))
			: fallback;
	switch (media.kind) {
		case 'json':
			return `Hono.TypedResponse<${body('unknown')}, ${status}, 'json'>`;
		case 'text':
			return `Hono.TypedResponse<${body('string')}, ${status}, 'text'>`;
		default:
			return `Hono.TypedResponse<unknown, ${status}, 'body'>`;
	}
}
