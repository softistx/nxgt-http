/**
 * The HTTP side of the spec.
 *
 * In `types.ts`: `Operations`, keyed by `operationId`, whose entries
 * carry what a handler gets (parameters and bodies as validated) and the
 * replies, plus the indexes `OperationsByRoute`, `PathsByMethod`,
 * `OperationsByTag` and `PathsByTag`. What a caller sends is `paths.ts`'s
 * business. In `operations.ts`: the same operations as data, with the
 * validators that read them off a request, which the Hono integration runs.
 */
import {
	HTTP_METHODS,
	type MediaIR,
	type ObjectNode,
	type OperationIR,
	type ParamIR,
	type Scalar,
	type SchemaNode,
} from '../ir/types';
import {
	type EmitContext,
	type ParamGroup,
	paramGroups,
	paramKey,
	routeKey,
} from './context';
import { docComment, jsString, list, propertyKey } from './printer';
import { type } from './types';
import {
	bounds,
	expr,
	ISO_DATE,
	literal,
	type Scope,
	withDefault,
} from './zod';

type Helper = 'flag' | 'isoDate' | 'none' | 'numeric' | 'repeated';

/** Declared at the top of `operations.ts` when a validator uses them. */
const HELPERS: Record<Helper, string> = {
	isoDate: ISO_DATE,
	flag: [
		'/** `true` or `false`, as JSON spells them. */',
		"const flag = z.stringbool({ truthy: ['true'], falsy: ['false'] });",
	].join('\n'),
	none: [
		'/** A location with no parameters declared: whatever arrives there is dropped. */',
		'const none = z.object({});',
	].join('\n'),
	numeric: [
		"/** A number in a path, a query or a header: digits, where z.coerce.number() would read '' as 0. */",
		'const numeric = z',
		'\t.string()',
		'\t.regex(/^-?(?:0|[1-9]\\d*)(?:\\.\\d+)?(?:[eE][+-]?\\d+)?$/)',
		'\t.transform(Number);',
	].join('\n'),
	repeated: [
		'/** A form field that may repeat: one value arrives alone, several as a list. */',
		'const repeated = (value: unknown) =>',
		'\tvalue === undefined || Array.isArray(value) ? value : [value];',
	].join('\n'),
};

const SPEC_TYPES = `/** How a server reads a parameter, and how a client writes it. */
export interface ParameterSpec {
	readonly name: string;
	readonly in: 'path' | 'query' | 'header';
	readonly required: boolean;
	/** A query list as \`?a=1&a=2\` (true) or \`?a=1,2\` (false). */
	readonly explode: boolean;
	/** Validated as a list: every value of a repeated query key, or one split on commas. */
	readonly list: boolean;
}

export interface MediaSpec {
	readonly kind: 'json' | 'form' | 'text' | 'binary' | 'sse' | 'jsonl';
	/** Absent for binary content, which is passed through unvalidated, and for a stream. */
	readonly schema?: z.ZodType;
	/** \`sse\`: each event's data, by name: a schema for JSON, \`null\` for text. Absent: any event, as text. */
	readonly events?: { readonly [event: string]: z.ZodType | null };
	/** \`jsonl\`: each item. Absent: any JSON. */
	readonly item?: z.ZodType;
}

/** An operation of the table; \`Client\` is its entry of \`ClientOperations\`. */
export interface OperationSpec<Client = unknown> {
	readonly method: ${HTTP_METHODS.map(jsString).join(' | ')};
	readonly path: string;
	readonly honoPath: string;
	readonly tags: readonly string[];
	readonly parameters: readonly ParameterSpec[];
	/** Validates the path parameters, each read as a string. */
	readonly param: z.ZodType;
	/** Validates the query: a string per parameter, or every value of a list. */
	readonly query: z.ZodType;
	/** Validates the headers, keyed by lowercased name. */
	readonly header: z.ZodType;
	readonly body?: {
		readonly required: boolean;
		readonly content: { readonly [mediaType: string]: MediaSpec };
	};
	readonly responses: {
		readonly [status: number]: { readonly [mediaType: string]: MediaSpec };
	};
	/** Never set: carries \`Client\`, so \`createOpenApiClient(http, operations)\` reads the spec's types off the table. */
	readonly '~client'?: Client;
}`;

/** A parameter's schema as it is validated: documented as the parameter, never null. */
export function valueSchema(param: ParamIR): SchemaNode {
	return {
		...param.schema,
		nullable: false,
		description: param.description ?? param.schema.description,
		deprecated: param.deprecated === true || param.schema.deprecated === true,
	};
}

function groupObject(group: ParamGroup): ObjectNode {
	return {
		kind: 'object',
		properties: group.params.map((param) => ({
			name: paramKey(param),
			required: param.required,
			schema: valueSchema(param),
		})),
		// Undeclared parameters are dropped whatever `unknownKeys` says: no index signature.
		additional: 'strict',
		extends: [],
	};
}

/** An operation's summary, description and deprecation, for a JSDoc. */
export function operationDocs(operation: OperationIR): string[] {
	const lines: string[] = [];
	if (operation.summary) lines.push(operation.summary);
	if (operation.description && operation.description !== operation.summary) {
		if (lines.length > 0) lines.push('');
		lines.push(operation.description);
	}
	if (operation.deprecated) lines.push('@deprecated');
	return lines;
}

// ---------------------------------------------------------------- types.ts

export function operationTypes(ctx: EmitContext): string[] {
	const blocks: string[] = [];
	for (const operation of ctx.ir.operations) {
		for (const group of paramGroups(operation)) {
			blocks.push(
				`export interface ${group.name} ${type(ctx, groupObject(group), false, '')}`,
			);
		}
	}
	const tags = byTag(ctx);
	blocks.push(
		operationsType(ctx),
		clientOperationsType(ctx),
		index(
			'The operation behind each route: `routes.put(path)` finds it here.',
			'OperationsByRoute',
			ctx.ir.operations.map(
				(operation) =>
					`\t${jsString(routeKey(operation))}: ${jsString(operation.operationId)};`,
			),
		),
		`/** The paths with an operation for each method. */\nexport interface PathsByMethod ${pathsByMethod(ctx.ir.operations, '')}`,
		index(
			'The operations under each tag.',
			'OperationsByTag',
			[...tags].map(
				([tag, operations]) =>
					`\t${propertyKey(tag)}: ${operations.map((o) => jsString(o.operationId)).join(' | ')};`,
			),
		),
		index(
			'`PathsByMethod`, for each tag.',
			'PathsByTag',
			[...tags].map(
				([tag, operations]) =>
					`\t${propertyKey(tag)}: ${pathsByMethod(operations, '\t')};`,
			),
		),
	);
	return blocks;
}

/**
 * What a client sends and gets back, per operation, as `@nxgt/openapi-httpyz`
 * reads it: `args`, what a call takes after the `operationId`, and `reply`,
 * every reply the spec declares, decoded; `wire` is the same as JSON carries
 * it. Each is written out here so that a call costs TypeScript one lookup.
 */
function clientOperationsType(ctx: EmitContext): string {
	const entries = ctx.ir.operations.map((operation) => {
		const indent = '\t\t';
		return [
			...docComment(operationDocs(operation), '\t'),
			`\t${propertyKey(operation.operationId)}: {`,
			`${indent}method: ${jsString(operation.method)};`,
			`${indent}path: ${jsString(operation.path)};`,
			`${indent}args: ${clientArgs(ctx, operation, indent)};`,
			`${indent}reply:${clientReplies(ctx, operation, false, indent)};`,
			`${indent}wire:${clientReplies(ctx, operation, true, indent)};`,
			...streamLine(ctx, operation, 'client', indent),
			'\t};',
		].join('\n');
	});
	const doc =
		'/** What a client sends and gets back: `args` after the operationId, and each declared `reply`. */';
	return entries.length === 0
		? `${doc}\nexport interface ClientOperations {}`
		: `${doc}\nexport interface ClientOperations {\n${entries.join('\n')}\n}`;
}

/** What a body of each kind is sent as, keyed as `c.req.valid()` reads it. */
const BODY_KEYS: Record<MediaIR['kind'], string> = {
	json: 'json',
	form: 'form',
	text: 'text',
	binary: 'body',
	// Only a reply is read an item at a time: a body of these kinds is text, or bytes.
	sse: 'text',
	jsonl: 'body',
};

/** The stream an operation replies with: the first `sse` or `jsonl` content of a 2xx reply. */
export function streamOf(operation: OperationIR): MediaIR | undefined {
	for (const response of operation.responses) {
		if (response.status < 200 || response.status > 299) continue;
		const media = response.content.find(
			(m) => m.kind === 'sse' || m.kind === 'jsonl',
		);
		if (media) return media;
	}
	return undefined;
}

/**
 * Each item of a stream: a JSON line, or a union of its events narrowed on
 * `event`. `side` is who holds it: a `client` reads it, decoded or as JSON
 * carries it (`wire`), with the ID the event came with; a `server` writes
 * it, and may give an `id` and a `retry`.
 */
function streamItem(
	ctx: EmitContext,
	media: MediaIR,
	side: 'client' | 'wire' | 'server',
	indent: string,
): string {
	const typed = (node: SchemaNode): string => {
		const decoded = type(ctx, node, false, `${indent}\t`);
		return side === 'wire' ? ctx.wire(node, decoded) : decoded;
	};
	if (media.kind === 'jsonl') return media.item ? typed(media.item) : 'unknown';
	const id =
		side === 'server'
			? 'id?: string; retry?: number'
			: 'id: string | undefined';
	if (!media.events) {
		return `{ event${side === 'server' ? '?' : ''}: string; data: string; ${id} }`;
	}
	const members = media.events.map(
		(event) =>
			`{ event: ${jsString(event.name)}; data: ${event.data ? typed(event.data) : 'string'}; ${id} }`,
	);
	return members.length === 1
		? (members[0] as string)
		: members.map((member) => `\n${indent}\t| ${member}`).join('');
}

/** An operation's `stream` entry, beside its replies. */
function streamLine(
	ctx: EmitContext,
	operation: OperationIR,
	side: 'client' | 'server',
	indent: string,
): string[] {
	const media = streamOf(operation);
	if (!media) return [];
	const inner = `${indent}\t`;
	// After the key's colon: a space, or a union on the lines below.
	const item = (key: string, of: 'client' | 'wire' | 'server') => {
		const text = streamItem(ctx, media, of, inner);
		return `${inner}${key}:${text.startsWith('\n') ? '' : ' '}${text};`;
	};
	const lines = [`${inner}kind: ${jsString(media.kind)};`];
	if (side === 'client')
		lines.push(item('item', 'client'), item('wire', 'wire'));
	else lines.push(item('item', 'server'));
	return [`${indent}stream: {`, ...lines, `${indent}};`];
}

/**
 * `[input]`, `[input?]` when nothing in it is required, or `[]` when the
 * operation takes nothing. The input holds each parameter location as the
 * caller writes it, defaults optional, and one body: a union when the spec
 * accepts several kinds.
 */
function clientArgs(
	ctx: EmitContext,
	operation: OperationIR,
	indent: string,
): string {
	const inner = `${indent}\t`;
	const groups = paramGroups(operation);
	const params = groups.map((group) => {
		const optional = group.params.some((p) => p.required) ? '' : '?';
		return `${inner}${group.target}${optional}: ${type(ctx, groupObject(group), true, inner)};`;
	});
	const { body } = operation;
	const kinds = [
		...new Map(
			(body?.content ?? []).map((media) => [media.kind, media]),
		).values(),
	];
	const bodyLine = (media: MediaIR): string => {
		const value =
			media.kind === 'binary' || !media.schema
				? media.kind === 'text'
					? 'string'
					: 'globalThis.Blob | ArrayBuffer | Uint8Array'
				: type(ctx, media.schema, true, inner);
		return `${inner}${BODY_KEYS[media.kind]}${body?.required ? '' : '?'}: ${value};`;
	};
	const inputs =
		kinds.length === 0
			? [params]
			: kinds.map((media) => [...params, bodyLine(media)]);
	if (inputs.every((lines) => lines.length === 0)) return '[]';
	const required =
		groups.some((group) => group.params.some((p) => p.required)) ||
		body?.required === true;
	const text = inputs
		.map((lines) => `{\n${lines.join('\n')}\n${indent}}`)
		.join(' | ');
	return `[input${required ? '' : '?'}: ${text}]`;
}

/**
 * Every declared reply as `{ status; type; data }`: decoded, or as JSON
 * carries it. Printed after the key's colon: a space, or a union on the
 * lines below.
 */
function clientReplies(
	ctx: EmitContext,
	operation: OperationIR,
	wire: boolean,
	indent: string,
): string {
	const inner = `${indent}\t`;
	const members = operation.responses.flatMap((response) => {
		if (response.content.length === 0) {
			return [
				`{ status: ${response.status}; type: undefined; data: undefined }`,
			];
		}
		return response.content.map((media) => {
			let data = 'globalThis.Blob';
			// A stream read whole: events as the text they came as, JSON lines as bytes.
			if (media.kind === 'text' || media.kind === 'sse') data = 'string';
			// Its fields are text: a client hands the form over as it came.
			if (media.kind === 'form') data = 'globalThis.FormData';
			else if (media.schema && media.kind !== 'binary') {
				const decoded = type(ctx, media.schema, false, inner);
				data = wire ? ctx.wire(media.schema, decoded) : decoded;
			} else if (media.kind === 'json') data = 'unknown';
			return `{ status: ${response.status}; type: ${jsString(media.mediaType)}; data: ${data} }`;
		});
	});
	if (members.length === 0) return ' never';
	if (members.length === 1) return ` ${members[0]}`;
	return members.map((member) => `\n${inner}| ${member}`).join('');
}

function index(doc: string, name: string, lines: readonly string[]): string {
	return lines.length === 0
		? `/** ${doc} */\nexport interface ${name} {}`
		: `/** ${doc} */\nexport interface ${name} {\n${lines.join('\n')}\n}`;
}

/** The operations of each tag, tags and operations in spec order. */
function byTag(ctx: EmitContext): Map<string, OperationIR[]> {
	const tags = new Map<string, OperationIR[]>();
	for (const operation of ctx.ir.operations) {
		for (const tag of new Set(operation.tags)) {
			tags.set(tag, [...(tags.get(tag) ?? []), operation]);
		}
	}
	return tags;
}

/** Every method, with the paths that have an operation for it. */
function pathsByMethod(
	operations: readonly OperationIR[],
	indent: string,
): string {
	const lines = HTTP_METHODS.map((method) => {
		const paths = [
			...new Set(
				operations
					.filter((operation) => operation.method === method)
					.map((operation) => jsString(operation.path)),
			),
		];
		return `${indent}\t${method}: ${paths.length === 0 ? 'never' : paths.join(' | ')};`;
	});
	return `{\n${lines.join('\n')}\n${indent}}`;
}

function operationsType(ctx: EmitContext): string {
	const entries = ctx.ir.operations.map((operation) =>
		operationEntry(ctx, operation),
	);
	return entries.length === 0
		? 'export interface Operations {}'
		: `export interface Operations {\n${entries.join('\n')}\n}`;
}

/** What a handler gets: parameters and bodies as validated, and the replies. */
function operationEntry(ctx: EmitContext, operation: OperationIR): string {
	const indent = '\t\t';
	const groups = new Map(paramGroups(operation).map((g) => [g.target, g]));
	const lines = [
		...docComment(operationDocs(operation), '\t'),
		`\t${propertyKey(operation.operationId)}: {`,
		`${indent}method: ${jsString(operation.method)};`,
		`${indent}path: ${jsString(operation.path)};`,
		`${indent}honoPath: ${jsString(operation.honoPath)};`,
	];
	for (const target of ['param', 'query', 'header'] as const) {
		lines.push(`${indent}${target}: ${groups.get(target)?.name ?? '{}'};`);
	}
	const { body } = operation;
	for (const kind of ['json', 'form'] as const) {
		const media = body?.content.find((m) => m.kind === kind);
		if (!body || !media?.schema) continue;
		const absent = body.required ? '' : ' | undefined';
		lines.push(
			`${indent}${kind}: ${type(ctx, media.schema, false, indent)}${absent};`,
		);
	}
	lines.push(
		`${indent}responses: ${responsesType(ctx, operation, indent)};`,
		...streamLine(ctx, operation, 'server', indent),
		'\t};',
	);
	return lines.join('\n');
}

function responsesType(
	ctx: EmitContext,
	operation: OperationIR,
	indent: string,
): string {
	if (operation.responses.length === 0) return '{}';
	const inner = `${indent}\t`;
	const lines = operation.responses.flatMap((response) => [
		...docComment(response.description ? [response.description] : [], inner),
		`${inner}${response.status}: ${contentType(ctx, response.content, inner)};`,
	]);
	return `{\n${lines.join('\n')}\n${indent}}`;
}

function contentType(
	ctx: EmitContext,
	content: readonly MediaIR[],
	indent: string,
): string {
	if (content.length === 0) return '{}';
	const inner = `${indent}\t`;
	const lines = content.map((media) => {
		const value = media.schema
			? type(ctx, media.schema, false, inner)
			: media.kind === 'sse'
				? 'string'
				: 'globalThis.Blob';
		return `${inner}${jsString(media.mediaType)}: ${value};`;
	});
	return `{\n${lines.join('\n')}\n${indent}}`;
}

// ----------------------------------------------------------- operations.ts

export function emitOperations(ctx: EmitContext): {
	sections: string[];
	imports: string[];
} {
	const helpers = new Set<Helper>();
	const uses = new Set<string>();
	/** What `expr` needs declared: the date codec. */
	const codecs = new Set<string>();
	const declared = new Set(ctx.ir.schemas.map((schema) => schema.id));
	const scope = (indent: string): Scope => ({
		declared,
		lazy: false,
		indent,
		uses,
		helpers: codecs,
	});

	const validators: string[] = [];
	for (const operation of ctx.ir.operations) {
		for (const group of paramGroups(operation)) {
			validators.push(
				`export const z${group.name} = ${paramObject(ctx, group, helpers, scope)};`,
			);
		}
		const form = ctx.formOf(operation);
		if (form) {
			validators.push(
				[
					...docComment(
						[
							`\`${operation.operationId}\`'s form body, its fields read from text.`,
						],
						'',
					),
					`export const z${operation.name}Form = ${formObject(ctx, form.object, helpers, scope)};`,
				].join('\n'),
			);
		}
	}
	const table = operationTable(ctx, helpers, scope);
	if (codecs.has('isoDate')) helpers.add('isoDate');

	const ext = ctx.options.importExtension;
	const imports = ["import { z } from 'zod';"];
	if (uses.size > 0) {
		const names = [...uses].map((id) => `z${ctx.schema(id).name}`).sort();
		imports.push(`import ${list('{ ', names, ' }', '')} from './zod${ext}';`);
	}
	imports.push(
		`import type { ClientOperations, Operations } from './types${ext}';`,
	);
	return {
		imports,
		sections: [
			SPEC_TYPES,
			...[...helpers].sort().map((helper) => HELPERS[helper]),
			...validators,
			table,
		],
	};
}

function paramObject(
	ctx: EmitContext,
	group: ParamGroup,
	helpers: Set<Helper>,
	scope: (indent: string) => Scope,
): string {
	const entries = group.params.map((param) => {
		let value = fromString(ctx, valueSchema(param), helpers, scope('\t'));
		const fallback = param.schema.default;
		if (!param.required) {
			value +=
				fallback === undefined
					? '.optional()'
					: withDefault(ctx, param.schema, fallback.value);
		}
		return `\t${propertyKey(paramKey(param))}: ${value},`;
	});
	return `z.object({\n${entries.join('\n')}\n})`;
}

/**
 * A form body's validator. A form carries text and files, so each field is
 * read like a parameter, and a list field takes one value alone as a list of
 * one. The object keeps its unknown-key mode.
 */
function formObject(
	ctx: EmitContext,
	object: ObjectNode,
	helpers: Set<Helper>,
	scope: (indent: string) => Scope,
): string {
	const entries = object.properties.map((property) => {
		let value = fromString(ctx, property.schema, helpers, scope('\t'));
		if (ctx.resolve(property.schema).kind === 'array') {
			helpers.add('repeated');
			value = `z.preprocess(repeated, ${value})`;
		}
		const fallback = property.schema.default;
		if (!property.required) {
			value +=
				fallback === undefined
					? '.optional()'
					: withDefault(ctx, property.schema, fallback.value);
		}
		return `\t${propertyKey(property.name)}: ${value},`;
	});
	const mode = ctx.mode(object);
	const create =
		mode === 'strict'
			? 'z.strictObject'
			: mode === 'loose'
				? 'z.looseObject'
				: 'z.object';
	return entries.length === 0
		? `${create}({})`
		: `${create}({\n${entries.join('\n')}\n})`;
}

/**
 * The validator for a value that arrives as text — a path segment, a query
 * value, a header — reading numbers and booleans out of it strictly.
 */
function fromString(
	ctx: EmitContext,
	node: SchemaNode,
	helpers: Set<Helper>,
	scope: Scope,
): string {
	const resolved = ctx.resolve(node);
	switch (resolved.kind) {
		case 'number':
			helpers.add('numeric');
			return `numeric.pipe(${expr(ctx, node, scope)})`;
		case 'boolean':
			helpers.add('flag');
			return node.kind === 'boolean'
				? 'flag'
				: `flag.pipe(${expr(ctx, node, scope)})`;
		case 'literal':
			return literalFromString(ctx, node, resolved.values, helpers, scope);
		case 'union': {
			const inner: Scope = { ...scope, indent: `${scope.indent}\t` };
			const variants = resolved.variants.map((variant) =>
				fromString(ctx, variant, helpers, inner),
			);
			return `z.union(${list('[', variants, ']', scope.indent)})`;
		}
		case 'array':
			return `z.array(${fromString(ctx, resolved.items, helpers, scope)})${bounds(resolved.minItems, resolved.maxItems)}`;
		default:
			return expr(ctx, node, scope);
	}
}

/** An enum of numbers is read as numbers, one of strings as it is, a mix as both. */
function literalFromString(
	ctx: EmitContext,
	node: SchemaNode,
	values: readonly Scalar[],
	helpers: Set<Helper>,
	scope: Scope,
): string {
	const pieces: string[] = [];
	const whole = expr(ctx, node, scope);
	for (const [kind, helper] of [
		['number', 'numeric'],
		['boolean', 'flag'],
		['string', undefined],
	] as const) {
		const some = values.filter((value) => typeof value === kind);
		if (some.length === 0) continue;
		const piece =
			some.length === values.length ? whole : literal(some, scope.indent);
		if (helper) helpers.add(helper);
		pieces.push(helper ? `${helper}.pipe(${piece})` : piece);
	}
	const [only] = pieces;
	return pieces.length === 1 && only !== undefined
		? only
		: `z.union(${list('[', pieces, ']', scope.indent)})`;
}

function operationTable(
	ctx: EmitContext,
	helpers: Set<Helper>,
	scope: (indent: string) => Scope,
): string {
	const entries = ctx.ir.operations.map((operation) => {
		const groups = new Map(paramGroups(operation).map((g) => [g.target, g]));
		const validator = (target: ParamGroup['target']): string => {
			const group = groups.get(target);
			if (group) return `z${group.name}`;
			helpers.add('none');
			return 'none';
		};
		const parameters = operation.parameters.map(
			(param) =>
				`{ name: ${jsString(param.name)}, in: ${jsString(param.in)}, required: ${param.required}, explode: ${param.explode}, list: ${ctx.resolve(param.schema).kind === 'array'} }`,
		);
		const lines = [
			`\t${propertyKey(operation.operationId)}: {`,
			`\t\tmethod: ${jsString(operation.method)},`,
			`\t\tpath: ${jsString(operation.path)},`,
			`\t\thonoPath: ${jsString(operation.honoPath)},`,
			`\t\ttags: ${list('[', operation.tags.map(jsString), ']', '\t\t')},`,
			`\t\tparameters: ${list('[', parameters, ']', '\t\t')},`,
			`\t\tparam: ${validator('param')},`,
			`\t\tquery: ${validator('query')},`,
			`\t\theader: ${validator('header')},`,
		];
		if (operation.body) {
			const form = ctx.formOf(operation);
			const named = form && {
				media: form.media,
				validator: `z${operation.name}Form`,
			};
			lines.push(
				'\t\tbody: {',
				`\t\t\trequired: ${operation.body.required},`,
				`\t\t\tcontent: ${contentSpec(ctx, operation.body.content, scope, '\t\t\t', named)},`,
				'\t\t},',
			);
		}
		lines.push(
			`\t\tresponses: ${responsesSpec(ctx, operation, scope, '\t\t')},`,
			'\t},',
		);
		return lines.join('\n');
	});
	const body = entries.length === 0 ? '{}' : `{\n${entries.join('\n')}\n}`;
	return `export const operations: {\n\treadonly [K in keyof Operations]: OperationSpec<ClientOperations[K]>;\n} = ${body};`;
}

function contentSpec(
	ctx: EmitContext,
	content: readonly MediaIR[],
	scope: (indent: string) => Scope,
	indent: string,
	/** A media type whose validator is declared above the table. */
	named?: { media: MediaIR; validator: string },
): string {
	if (content.length === 0) return '{}';
	const inner = `${indent}\t`;
	const lines = content.map((media) => {
		const key = `${inner}${jsString(media.mediaType)}`;
		if (media.kind === 'jsonl' && media.item) {
			return `${key}: { kind: 'jsonl', item: ${expr(ctx, media.item, scope(inner))} },`;
		}
		if (media.kind === 'sse' && media.events) {
			const deeper = `${inner}\t\t`;
			const events = media.events.map(
				(event) =>
					`${deeper}${propertyKey(event.name)}: ${event.data ? expr(ctx, event.data, scope(deeper)) : 'null'},`,
			);
			return [
				`${key}: {`,
				`${inner}\tkind: 'sse',`,
				`${inner}\tevents: {`,
				...events,
				`${inner}\t},`,
				`${inner}},`,
			].join('\n');
		}
		const schema =
			named?.media === media
				? `, schema: ${named.validator}`
				: media.schema
					? `, schema: ${expr(ctx, media.schema, scope(inner))}`
					: '';
		return `${inner}${jsString(media.mediaType)}: { kind: ${jsString(media.kind)}${schema} },`;
	});
	return `{\n${lines.join('\n')}\n${indent}}`;
}

function responsesSpec(
	ctx: EmitContext,
	operation: OperationIR,
	scope: (indent: string) => Scope,
	indent: string,
): string {
	if (operation.responses.length === 0) return '{}';
	const inner = `${indent}\t`;
	const lines = operation.responses.map(
		(response) =>
			`${inner}${response.status}: ${contentSpec(ctx, response.content, scope, inner)},`,
	);
	return `{\n${lines.join('\n')}\n${indent}}`;
}
