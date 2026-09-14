import type { Diagnostics } from '../errors';
import type { LoadedDocument } from '../loader/document';
import { child, type Location } from '../loader/location';
import type { Resolver } from '../loader/resolver';
import { asString, isObject } from '../util';
import { operationIdFor, pascalCase, sharedName, toHonoPath } from './naming';
import type { SchemaBuilder } from './schemas';
import {
	type BodyIR,
	HTTP_METHODS,
	type HttpMethod,
	type MediaIR,
	type MediaKind,
	type OperationIR,
	type ParamIR,
	type ParamLocation,
	type ResponseIR,
	type SchemaNode,
} from './types';

/** The one serialization each location supports in v1. */
const STYLE: Record<ParamLocation, string> = {
	path: 'simple',
	query: 'form',
	header: 'simple',
};

/** OpenAPI says header parameters with these names are ignored: HTTP owns them. */
const RESERVED_HEADERS = new Set(['accept', 'content-type', 'authorization']);

const SCALAR_KINDS = new Set<SchemaNode['kind']>([
	'string',
	'number',
	'boolean',
	'literal',
	'unknown',
]);

const KIND_NAMES: Partial<Record<SchemaNode['kind'], string>> = {
	object: 'an object',
	record: 'a map',
	intersection: 'an intersection',
	union: 'a union of non-scalar values',
	array: 'a nested list',
	binary: 'binary content',
	null: 'null',
	never: 'never',
};

export function mediaKind(mediaType: string): MediaKind {
	const type = (mediaType.split(';')[0] ?? '').trim().toLowerCase();
	if (
		type === 'application/json' ||
		/^application\/[\w.-]+\+json$/.test(type)
	) {
		return 'json';
	}
	if (
		type === 'application/x-www-form-urlencoded' ||
		type === 'multipart/form-data'
	) {
		return 'form';
	}
	return type.startsWith('text/') ? 'text' : 'binary';
}

/**
 * Every operation under `paths`, with its parameters merged from the path
 * item, its bodies and responses resolved, and inline shapes named after it.
 */
export class OperationBuilder {
	readonly #doc: LoadedDocument;
	readonly #resolver: Resolver;
	readonly #schemas: SchemaBuilder;
	readonly #diagnostics: Diagnostics;
	readonly #ids = new Map<string, Location>();

	constructor(
		doc: LoadedDocument,
		schemas: SchemaBuilder,
		diagnostics: Diagnostics,
	) {
		this.#doc = doc;
		this.#resolver = doc.resolver;
		this.#schemas = schemas;
		this.#diagnostics = diagnostics;
	}

	build(): OperationIR[] {
		const { document, entry } = this.#doc;
		const operations: OperationIR[] = [];
		if (document.paths === undefined) return operations;
		if (!isObject(document.paths)) {
			this.#diagnostics.error(
				'invalid_operation',
				'`paths` must be an object',
				child(entry, 'paths'),
			);
			return operations;
		}

		for (const [path, raw] of Object.entries(document.paths)) {
			const pathAt = child(entry, 'paths', path);
			if (!path.startsWith('/')) {
				this.#diagnostics.error(
					'invalid_operation',
					`path \`${path}\` must start with /`,
					pathAt,
				);
				continue;
			}
			// A path item `$ref` with fields beside it is no longer a plain
			// reference: the operations it points at would be lost silently.
			let target: unknown = raw;
			if (isObject(raw) && typeof raw.$ref === 'string') {
				const extra = Object.keys(raw).filter(
					(key) => !['$ref', 'summary', 'description'].includes(key),
				);
				if (extra.length > 0) {
					this.#diagnostics.error(
						'invalid_operation',
						`a path item \`$ref\` with ${extra.map((key) => `\`${key}\``).join(', ')} beside it is not supported: move ${extra.length > 1 ? 'them' : 'it'} into the file it refers to`,
						child(pathAt, extra[0] ?? '$ref'),
					);
					continue;
				}
				target = { $ref: raw.$ref };
			}
			const item = this.#resolver.deref(target, pathAt);
			if (!isObject(item.value)) {
				this.#diagnostics.error(
					'invalid_operation',
					'a path item must be an object',
					item.location,
				);
				continue;
			}
			const shared = this.#parameters(
				item.value.parameters,
				child(item.location, 'parameters'),
			);
			for (const [key, value] of Object.entries(item.value)) {
				const at = child(item.location, key);
				if (key === 'additionalOperations') {
					this.#diagnostics.error(
						'unsupported_operation',
						'`additionalOperations` (OpenAPI 3.2) is not supported',
						at,
					);
					continue;
				}
				if (!(HTTP_METHODS as readonly string[]).includes(key)) continue;
				if (key === 'query' && this.#doc.version !== '3.2') {
					this.#diagnostics.error(
						'unsupported_operation',
						`the \`query\` operation is OpenAPI 3.2, and this document is ${this.#doc.openapi}`,
						at,
					);
					continue;
				}
				const operation = this.#operation(
					key as HttpMethod,
					path,
					value,
					at,
					shared,
				);
				if (operation) operations.push(operation);
			}
		}
		return operations;
	}

	/** Once every schema is built: can each parameter be read from a URL or a header? */
	checkParameters(operations: readonly OperationIR[]): void {
		const scalar = (node: SchemaNode) =>
			SCALAR_KINDS.has(this.#schemas.resolve(node).kind);
		for (const operation of operations) {
			for (const parameter of operation.parameters) {
				const node = this.#schemas.resolve(parameter.schema);
				const at = child(parameter.location, 'schema');
				if (node.kind === 'array' && parameter.in === 'path') {
					this.#diagnostics.error(
						'unsupported_parameter',
						`path parameter \`${parameter.name}\` is a list; a path segment carries one value`,
						at,
					);
					continue;
				}
				const item =
					node.kind === 'array' ? this.#schemas.resolve(node.items) : node;
				if (scalar(item)) continue;
				if (item.kind === 'union' && item.variants.every(scalar)) continue;
				this.#diagnostics.error(
					'unsupported_parameter',
					`${parameter.in} parameter \`${parameter.name}\` is ${KIND_NAMES[item.kind] ?? item.kind}; ` +
						`only strings, numbers, booleans, enums and lists of them can be read from ${parameter.in === 'header' ? 'a header' : 'a URL'}`,
					at,
				);
			}
		}
	}

	#operation(
		method: HttpMethod,
		path: string,
		raw: unknown,
		at: Location,
		shared: Map<string, ParamIR>,
	): OperationIR | undefined {
		if (!isObject(raw)) {
			this.#diagnostics.error(
				'invalid_operation',
				'an operation must be an object',
				at,
			);
			return undefined;
		}
		let operationId = asString(raw.operationId);
		if (!operationId) {
			operationId = operationIdFor(method, path);
			this.#diagnostics.warning(
				'missing_operation_id',
				`no \`operationId\`; generated as \`${operationId}\``,
				at,
			);
		}
		const previous = this.#ids.get(operationId);
		if (previous) {
			this.#diagnostics.error(
				'duplicate_operation_id',
				`\`operationId: ${operationId}\` is also used at ${this.#schemas.display(previous)}`,
				child(at, 'operationId'),
			);
			return undefined;
		}
		this.#ids.set(operationId, at);

		const name = pascalCase(operationId);
		// An operation's parameter replaces the path item's with the same name and location.
		const own = this.#parameters(raw.parameters, child(at, 'parameters'));
		const parameters = [...new Map([...shared, ...own]).values()];
		this.#checkTemplate(path, parameters, at);
		if (raw.callbacks !== undefined) {
			this.#diagnostics.warning(
				'ignored',
				'callbacks are not generated',
				child(at, 'callbacks'),
			);
		}

		return {
			operationId,
			name,
			method,
			path,
			honoPath: toHonoPath(path),
			summary: asString(raw.summary),
			description: asString(raw.description),
			deprecated: raw.deprecated === true,
			tags: Array.isArray(raw.tags)
				? raw.tags.filter((tag): tag is string => typeof tag === 'string')
				: [],
			parameters,
			body:
				raw.requestBody === undefined
					? undefined
					: this.#body(raw.requestBody, child(at, 'requestBody'), name),
			responses: this.#responses(raw.responses, child(at, 'responses'), name),
			location: at,
		};
	}

	#parameters(raw: unknown, at: Location): Map<string, ParamIR> {
		const parameters = new Map<string, ParamIR>();
		if (raw === undefined) return parameters;
		if (!Array.isArray(raw)) {
			this.#diagnostics.error(
				'invalid_operation',
				'`parameters` must be a list',
				at,
			);
			return parameters;
		}
		for (const [index, value] of raw.entries()) {
			const parameter = this.#parameter(value, child(at, index));
			if (!parameter) continue;
			// Header names are case-insensitive; the rest are not.
			const key =
				parameter.in === 'header'
					? parameter.name.toLowerCase()
					: parameter.name;
			parameters.set(`${parameter.in}:${key}`, parameter);
		}
		return parameters;
	}

	#parameter(raw: unknown, site: Location): ParamIR | undefined {
		const { value: p, location: at } = this.#resolver.deref(raw, site);
		if (
			!isObject(p) ||
			typeof p.name !== 'string' ||
			typeof p.in !== 'string'
		) {
			this.#diagnostics.error(
				'invalid_operation',
				'a parameter needs a string `name` and `in`',
				at,
			);
			return undefined;
		}
		const where = p.in;
		if (where === 'cookie') {
			this.#diagnostics.error(
				'unsupported_parameter',
				`cookie parameter \`${p.name}\` is not supported`,
				child(at, 'in'),
			);
			return undefined;
		}
		if (where === 'querystring') {
			this.#diagnostics.error(
				'unsupported_parameter',
				'`in: querystring` (OpenAPI 3.2) is not supported',
				child(at, 'in'),
			);
			return undefined;
		}
		if (where !== 'path' && where !== 'query' && where !== 'header') {
			this.#diagnostics.error(
				'invalid_operation',
				`\`in: ${where}\` is not a parameter location`,
				child(at, 'in'),
			);
			return undefined;
		}
		if (where === 'header' && RESERVED_HEADERS.has(p.name.toLowerCase())) {
			return undefined;
		}
		if ('content' in p) {
			this.#diagnostics.error(
				'unsupported_parameter',
				`parameter \`${p.name}\` is described by \`content\`; describe it with \`schema\``,
				child(at, 'content'),
			);
			return undefined;
		}
		const style = asString(p.style) ?? STYLE[where];
		if (style !== STYLE[where]) {
			this.#diagnostics.error(
				'unsupported_parameter',
				`\`style: ${style}\` is not supported for a ${where} parameter, only \`${STYLE[where]}\``,
				child(at, 'style'),
			);
			return undefined;
		}
		if (where === 'path' && p.required !== true) {
			this.#diagnostics.warning(
				'invalid_operation',
				'a path parameter is always required; `required: true` is implied',
				at,
			);
		}
		return {
			name: p.name,
			in: where,
			required: where === 'path' || p.required === true,
			explode: typeof p.explode === 'boolean' ? p.explode : style === 'form',
			schema: this.#schemas.node(p.schema, child(at, 'schema')),
			description: asString(p.description),
			deprecated: p.deprecated === true ? true : undefined,
			location: at,
		};
	}

	#checkTemplate(path: string, parameters: ParamIR[], at: Location): void {
		const template = [...path.matchAll(/\{([^}]+)\}/g)].map((m) => m[1] ?? '');
		const declared = parameters
			.filter((parameter) => parameter.in === 'path')
			.map((parameter) => parameter.name);
		for (const name of template) {
			if (declared.includes(name)) continue;
			this.#diagnostics.error(
				'path_parameter_mismatch',
				`\`{${name}}\` in the path has no \`in: path\` parameter`,
				at,
			);
		}
		for (const name of declared) {
			if (template.includes(name)) continue;
			this.#diagnostics.error(
				'path_parameter_mismatch',
				`path parameter \`${name}\` does not appear in \`${path}\``,
				at,
			);
		}
	}

	#body(raw: unknown, site: Location, name: string): BodyIR | undefined {
		const body = this.#resolver.deref(raw, site);
		if (!isObject(body.value)) {
			this.#diagnostics.error(
				'invalid_operation',
				'`requestBody` must be an object',
				body.location,
			);
			return undefined;
		}
		// A shared body is named after itself, not after whichever operation came first.
		const stem =
			body.hops.length > 0 ? sharedName(body.location, 'Body') : `${name}Body`;
		return {
			required: body.value.required === true,
			description: body.description ?? asString(body.value.description),
			content: this.#content(
				body.value.content,
				child(body.location, 'content'),
				stem,
			),
		};
	}

	#responses(raw: unknown, at: Location, name: string): ResponseIR[] {
		const responses: ResponseIR[] = [];
		if (raw === undefined) return responses;
		if (!isObject(raw)) {
			this.#diagnostics.error(
				'invalid_operation',
				'`responses` must be an object',
				at,
			);
			return responses;
		}
		for (const [code, value] of Object.entries(raw)) {
			const codeAt = child(at, code);
			if (!/^[1-5]\d\d$/.test(code)) {
				if (code === 'default' || /^[1-5]XX$/i.test(code)) {
					this.#diagnostics.warning(
						'ignored',
						`response \`${code}\` is not generated: replies are typed by exact status code`,
						codeAt,
					);
				} else {
					this.#diagnostics.error(
						'invalid_operation',
						`\`${code}\` is not an HTTP status code`,
						codeAt,
					);
				}
				continue;
			}
			const response = this.#resolver.deref(value, codeAt);
			if (!isObject(response.value)) {
				this.#diagnostics.error(
					'invalid_operation',
					'a response must be an object',
					response.location,
				);
				continue;
			}
			const stem =
				response.hops.length > 0
					? sharedName(response.location, 'Response')
					: `${name}${code}Response`;
			responses.push({
				status: Number(code),
				description:
					response.description ?? asString(response.value.description),
				content: this.#content(
					response.value.content,
					child(response.location, 'content'),
					stem,
				),
				location: response.location,
			});
		}
		return responses;
	}

	#content(raw: unknown, at: Location, stem: string): MediaIR[] {
		const media: MediaIR[] = [];
		if (raw === undefined) return media;
		if (!isObject(raw)) {
			this.#diagnostics.error(
				'invalid_operation',
				'`content` must be an object',
				at,
			);
			return media;
		}
		let structured = 0;
		for (const [mediaType, value] of Object.entries(raw)) {
			const entry = this.#resolver.deref(value, child(at, mediaType));
			const object = isObject(entry.value) ? entry.value : {};
			const schemaAt = child(entry.location, 'schema');
			const kind = mediaKind(mediaType);
			let schema: SchemaNode | undefined;
			if (kind === 'json' || kind === 'form') {
				structured++;
				schema = this.#schemas.inline(
					object.schema,
					schemaAt,
					structured === 1 ? stem : `${stem}${structured}`,
				);
			} else if (kind === 'text') {
				schema =
					object.schema === undefined
						? { kind: 'string' }
						: this.#schemas.node(object.schema, schemaAt);
			}
			media.push({ mediaType, kind, schema });
		}
		return media;
	}
}
