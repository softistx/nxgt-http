/**
 * `alxia.ts`, with the `alxia` option: each operation as the data
 * `@alxia/core`'s `app.route(operation, ...middlewares, handler)` takes
 * (0.4 or later) — its method, its path written with `:name`, and its route
 * schema — then `operations`, all of them by operationId. Plain data: it
 * imports `zod` and `./zod`, and `eventStream` from `@alxia/core` only for
 * a reply that streams events.
 *
 * The schemas accept what alxia hands them: path parameters as strings, a
 * query key given once as a string and given more than once as a list,
 * headers keyed lowercased, cookies by name as strings, a body read by its
 * `content-type`. alxia answers a request they refuse with its own 400,
 * which it types itself, so the 400 `validationErrors` declares is never
 * written here.
 */
import type { OperationIR } from '../../ir/types';
import type { EmitContext } from '../context';
import { HELPERS } from '../operation/helpers';
import { operationDocs } from '../operation/read';
import { docComment, file, jsString, list, propertyKey } from '../printer';
import { operationConst } from './names';
import { type Issue, LOCALS, type Printing } from './printing';
import { replySchema } from './reply';
import { bodySchema, paramsObject } from './request';
import { METHODS, STATUSES, shapeOf, unroutable } from './routable';

const RUNTIME = '@alxia/core';

/** Each location's part of alxia's route schema, in the order alxia validates them. */
const PARTS = [
	['path', 'params'],
	['query', 'query'],
	['header', 'headers'],
	['cookie', 'cookies'],
] as const;

/** A fresh printing state: the whole file's, or one operation's until it is kept. */
const blank = (ctx: EmitContext): Printing => ({
	ctx,
	helpers: new Set(),
	locals: new Set(),
	uses: new Set(),
	codecs: new Set(),
	declared: new Set(ctx.ir.schemas.map((schema) => schema.id)),
	zod: false,
	eventStream: false,
});

function merge(into: Printing, from: Printing): void {
	for (const key of ['helpers', 'locals', 'uses', 'codecs'] as const) {
		for (const value of from[key]) (into[key] as Set<string>).add(value);
	}
	into.zod ||= from.zod;
	into.eventStream ||= from.eventStream;
}

function warn(
	ctx: EmitContext,
	operation: OperationIR,
	code: 'ignored' | 'not_enforced',
	message: string,
	at: { file: string; pointer: string } = operation.location,
): void {
	ctx.warnings.push({
		severity: 'warning',
		code,
		message: `${operation.operationId}: ${message}`,
		file: at.file,
		pointer: at.pointer,
	});
}

/**
 * `alxia.ts`. `operations` are the spec's own, before `validationErrors`
 * declares its 400 on them: alxia answers a refused request itself.
 */
export function emitAlxia(
	ctx: EmitContext,
	operations: readonly OperationIR[] = ctx.ir.operations,
): string {
	const printing = blank(ctx);
	/** The paths kept, by shape, as alxia's router compares them. */
	const shapes = new Map<string, string>();
	const consts: string[] = [];
	const kept: OperationIR[] = [];
	for (const operation of operations) {
		const why = unroutable(operation, shapes);
		// Merged only once kept: a left-out operation imports nothing.
		const own = blank(ctx);
		const built = why === undefined ? declaration(own, operation) : why;
		if (typeof built === 'string') {
			warn(ctx, operation, 'ignored', `alxia.ts leaves it out. ${built}`);
			continue;
		}
		for (const issue of built.issues) {
			warn(ctx, operation, 'not_enforced', issue.message, issue.at);
		}
		merge(printing, own);
		shapes.set(shapeOf(operation.path), operation.path);
		consts.push(built.text);
		kept.push(operation);
	}
	return file([
		ctx.header,
		USAGE,
		...preamble(printing),
		...consts,
		table(kept),
	]);
}

/** How the file is used, below the header. */
const USAGE = `/**
 * Each operation as \`@alxia/core\`'s \`app.route(operation, ...middlewares, handler)\`
 * takes it, @alxia/core 0.4 or later. The route validates the request and
 * checks the handler's reply against \`schema.response\`, both just before
 * the handler: \`validate(operation)\` or \`responds(operation)\` stands
 * earlier among the middlewares when one is placed there.
 * \`matchesSpec(app, operations)\`, from \`@alxia/openapi\`, fails while an
 * operation has no route.
 */`;

/** The imports, then the helpers the schemas call. */
function preamble(printing: Printing): string[] {
	const { ctx } = printing;
	const imports: string[] = [];
	if (printing.eventStream) {
		imports.push(`import { eventStream } from '${RUNTIME}';`);
	}
	const helpers = [...printing.helpers];
	if (printing.zod || helpers.some((h) => h === 'numeric' || h === 'flag')) {
		imports.push("import { z } from 'zod';");
	}
	if (printing.uses.size > 0) {
		const names = [...printing.uses]
			.map((id) => `z${ctx.schema(id).name}`)
			.sort();
		const ext = ctx.options.importExtension;
		imports.push(`import ${list('{ ', names, ' }', '')} from './zod${ext}';`);
	}
	if (printing.codecs.has('isoDate')) helpers.push('isoDate');
	return [
		...(imports.length > 0 ? [imports.join('\n')] : []),
		...helpers.sort().map((helper) => HELPERS[helper]),
		...[...printing.locals].sort().map((local) => LOCALS[local]),
	];
}

/** `operations`, every constant by its operationId. */
function table(kept: readonly OperationIR[]): string {
	const entries = kept.map((operation) => {
		const name = operationConst(operation);
		const key = propertyKey(operation.operationId);
		return key === name ? `\t${name},` : `\t${key}: ${name},`;
	});
	const [first] = kept;
	const access =
		first === undefined
			? undefined
			: propertyKey(first.operationId) === operationConst(first)
				? `.${operationConst(first)}`
				: `[${jsString(first.operationId)}]`;
	return [
		access === undefined
			? '/** Every operation alxia routes, by operationId. */'
			: `/** Every operation alxia routes, by operationId: \`app.route(operations${access}, ...middlewares, handler)\`. */`,
		entries.length === 0
			? 'export const operations = {} as const;'
			: `export const operations = {\n${entries.join('\n')}\n} as const;`,
	].join('\n');
}

/** The operation's `export const`, or why it cannot be declared. */
function declaration(
	printing: Printing,
	operation: OperationIR,
): { text: string; issues: Issue[] } | string {
	const issues: Issue[] = [];
	const lines: string[] = [];
	for (const [location, key] of PARTS) {
		const params =
			location === 'cookie'
				? operation.cookies
				: operation.parameters.filter((p) => p.in === location);
		if (params.length === 0) continue;
		lines.push(`\t\t${key}: ${paramsObject(printing, params, location)},`);
	}
	if (operation.body) {
		const body = bodySchema(printing, operation, issues);
		if (body.skip !== undefined) return body.skip;
		lines.push(`\t\tbody: ${body.text},`);
	}
	const response: string[] = [];
	for (const reply of operation.responses) {
		if (!STATUSES.has(reply.status)) {
			issues.push({
				message: `alxia has no status ${reply.status}, so alxia.ts leaves that reply out, and the handler cannot send it`,
				at: reply.location,
			});
			continue;
		}
		const chosen = replySchema(printing, reply.content);
		if (chosen.skip !== undefined) {
			return `Its ${reply.status} reply ${chosen.skip}`;
		}
		if (chosen.others.length > 0) {
			issues.push({
				message: `alxia declares one schema per status, so its ${reply.status} reply is declared as ${chosen.media} only, not ${chosen.others.join(', ')}`,
				at: reply.location,
			});
		}
		response.push(`\t\t\t${reply.status}: ${chosen.text},`);
	}
	if (response.length > 0) {
		lines.push(`\t\tresponse: {\n${response.join('\n')}\n\t\t},`);
	}
	lines.push(`\t\tdetail: ${detail(operation)},`);
	return {
		text: [
			...docComment(operationDocs(operation), ''),
			`export const ${operationConst(operation)} = {`,
			`\tmethod: ${jsString(METHODS[operation.method] ?? '')},`,
			`\tpath: ${jsString(operation.honoPath)},`,
			'\tschema: {',
			...lines,
			'\t},',
			'} as const;',
		].join('\n'),
		issues,
	};
}

/** What alxia's OpenAPI document says of the route: only what the spec does. */
function detail(operation: OperationIR): string {
	const entries = [`operationId: ${jsString(operation.operationId)}`];
	if (operation.summary)
		entries.push(`summary: ${jsString(operation.summary)}`);
	if (operation.description) {
		entries.push(`description: ${jsString(operation.description)}`);
	}
	if (operation.tags.length > 0) {
		entries.push(
			`tags: ${list('[', operation.tags.map(jsString), ']', '\t\t\t')}`,
		);
	}
	if (operation.deprecated) entries.push('deprecated: true');
	return list('{ ', entries, ' }', '\t\t');
}
