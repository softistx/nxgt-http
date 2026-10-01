import {
	isEventStreamSchema,
	type Method,
	type RouteDefinition,
	type StandardSchemaV1,
} from '@alxia/core';
import { type Converter, type JsonSchema, toJsonSchema } from './json-schema';

export interface OpenApiInfo {
	readonly title: string;
	readonly version: string;
	readonly description?: string;
}

export interface OpenApiOptions {
	readonly info: OpenApiInfo;
	readonly servers?: readonly {
		readonly url: string;
		readonly description?: string;
	}[];
	/** Converts a schema whose vendor carries no Standard JSON Schema. */
	readonly convert?: Converter;
	/** Leaves a route out of the document. */
	readonly exclude?: (route: RouteDefinition) => boolean;
}

export interface OpenApiDocument {
	readonly openapi: '3.1.0';
	readonly info: OpenApiInfo;
	readonly servers?: readonly {
		readonly url: string;
		readonly description?: string;
	}[];
	readonly paths: Record<string, Partial<Record<Lowercase<Method>, Operation>>>;
	readonly components: { readonly schemas: Record<string, JsonSchema> };
}

export interface Operation {
	operationId: string;
	summary?: string;
	description?: string;
	tags?: string[];
	deprecated?: boolean;
	parameters?: Parameter[];
	requestBody?: {
		required: boolean;
		content: Record<string, { schema: JsonSchema }>;
	};
	responses: Record<string, Response>;
}

interface Parameter {
	name: string;
	in: 'path' | 'query' | 'header' | 'cookie';
	required: boolean;
	schema: JsonSchema;
	description?: string;
}

interface Response {
	description: string;
	content?: Record<string, { schema: JsonSchema }>;
}

const ISSUE: JsonSchema = {
	type: 'object',
	properties: {
		target: { enum: ['params', 'query', 'headers', 'cookies', 'body'] },
		path: { type: 'array', items: { type: ['string', 'integer'] } },
		code: { type: 'string' },
		message: { type: 'string' },
	},
	required: ['target', 'path', 'code', 'message'],
};

const COMPONENTS: Record<string, JsonSchema> = {
	ValidationError: {
		type: 'object',
		properties: {
			error: { const: 'validation' },
			issues: { type: 'array', items: ISSUE },
		},
		required: ['error', 'issues'],
	},
	InternalError: {
		type: 'object',
		properties: { error: { const: 'internal' } },
		required: ['error'],
	},
};

/** `/users/:id/*` as OpenAPI writes it, `/users/{id}/{path}`. */
export function openApiPath(path: string): string {
	return path
		.split('/')
		.map((segment) =>
			segment === '*'
				? '{path}'
				: segment.startsWith(':')
					? `{${segment.slice(1)}}`
					: segment,
		)
		.join('/');
}

/** `GET /users/:id` as an operation id, `getUsersById`, unless the route names its own. */
export function operationId(method: Method, path: string): string {
	const words = path
		.split('/')
		.filter(Boolean)
		.map((segment) =>
			segment === '*'
				? 'Path'
				: segment.startsWith(':')
					? `By${capitalize(segment.slice(1))}`
					: segment
							.split(/[^A-Za-z0-9]+/)
							.filter(Boolean)
							.map(capitalize)
							.join(''),
		);
	return method.toLowerCase() + words.join('');
}

function capitalize(word: string): string {
	return word.charAt(0).toUpperCase() + word.slice(1);
}

/**
 * The OpenAPI 3.1 document of an app's routes. Every route is documented as
 * it runs: its 400 when it validates its request, the 500 any route may
 * answer, and each reply its schema declares.
 *
 * ```ts
 * const document = openapi(app, { info: { title: 'Users', version: '1.0.0' } });
 * ```
 */
export function openapi(
	app: { readonly routes: readonly RouteDefinition[] },
	options: OpenApiOptions,
): OpenApiDocument {
	const paths: OpenApiDocument['paths'] = {};
	for (const route of app.routes) {
		if (options.exclude?.(route)) continue;
		const path = openApiPath(route.path);
		paths[path] ??= {};
		const methodKey = route.method.toLowerCase() as Lowercase<Method>;
		paths[path][methodKey] = operation(route, options.convert);
	}
	return {
		openapi: '3.1.0',
		info: options.info,
		...(options.servers === undefined ? {} : { servers: options.servers }),
		paths,
		components: { schemas: COMPONENTS },
	};
}

function operation(route: RouteDefinition, convert?: Converter): Operation {
	const { schema, method, path } = route;
	const detail = schema.detail ?? {};
	const op: Operation = {
		operationId: detail.operationId ?? operationId(method, path),
		responses: {},
	};
	if (detail.summary !== undefined) op.summary = detail.summary;
	if (detail.description !== undefined) op.description = detail.description;
	if (detail.tags !== undefined) op.tags = [...detail.tags];
	if (detail.deprecated !== undefined) op.deprecated = detail.deprecated;

	const parameters: Parameter[] = [
		...pathParameters(path, schema.params, convert),
		...objectParameters('query', schema.query, convert),
		...objectParameters('header', schema.headers, convert),
		...objectParameters('cookie', schema.cookies, convert),
	];
	if (parameters.length > 0) op.parameters = parameters;

	if (schema.body !== undefined) {
		const body = toJsonSchema(schema.body, 'input', convert);
		op.requestBody = {
			required: true,
			content: { 'application/json': { schema: body } },
		};
	}

	for (const [status, responseSchema] of Object.entries(
		schema.response ?? {},
	)) {
		if (responseSchema === undefined) continue;
		const json = toJsonSchema(responseSchema, 'output', convert);
		op.responses[status] =
			status === '204' || status === '304'
				? { description: describe(status) }
				: {
						description: describe(status),
						content: {
							[isEventStreamSchema(responseSchema)
								? 'text/event-stream'
								: contentType(json)]: { schema: json },
						},
					};
	}
	if (schema.response === undefined) {
		op.responses['default'] = { description: 'The reply of the handler' };
	}
	if (
		schema.params !== undefined ||
		schema.query !== undefined ||
		schema.headers !== undefined ||
		schema.cookies !== undefined ||
		schema.body !== undefined
	) {
		op.responses['400'] = errorResponse(
			'The request was refused',
			'ValidationError',
		);
	}
	op.responses['500'] = errorResponse('The server failed', 'InternalError');
	return op;
}

function errorResponse(description: string, component: string): Response {
	return {
		description,
		content: {
			'application/json': {
				schema: { $ref: `#/components/schemas/${component}` },
			},
		},
	};
}

function contentType(schema: JsonSchema): string {
	return schema['type'] === 'string' ? 'text/plain' : 'application/json';
}

function describe(status: string): string {
	const known: Record<string, string> = {
		'200': 'OK',
		'201': 'Created',
		'202': 'Accepted',
		'204': 'No content',
		'400': 'Bad request',
		'401': 'Unauthorized',
		'403': 'Forbidden',
		'404': 'Not found',
		'409': 'Conflict',
		'422': 'Unprocessable content',
	};
	return known[status] ?? `HTTP ${status}`;
}

function pathParameters(
	path: string,
	schema: StandardSchemaV1 | undefined,
	convert?: Converter,
): Parameter[] {
	const properties = propertiesOf(schema, convert);
	return path
		.split('/')
		.filter((segment) => segment.startsWith(':') || segment === '*')
		.map((segment) => {
			const name = segment === '*' ? 'path' : segment.slice(1);
			const key = segment === '*' ? '*' : name;
			return {
				name,
				in: 'path',
				required: true,
				schema: properties?.schemas[key] ?? { type: 'string' },
			};
		});
}

function objectParameters(
	location: 'query' | 'header' | 'cookie',
	schema: StandardSchemaV1 | undefined,
	convert?: Converter,
): Parameter[] {
	const properties = propertiesOf(schema, convert);
	if (properties === undefined) return [];
	return Object.entries(properties.schemas).map(([name, property]) => {
		const parameter: Parameter = {
			name,
			in: location,
			required: properties.required.has(name),
			schema: property,
		};
		if (typeof property['description'] === 'string') {
			parameter.description = property['description'];
		}
		return parameter;
	});
}

function propertiesOf(
	schema: StandardSchemaV1 | undefined,
	convert?: Converter,
): { schemas: Record<string, JsonSchema>; required: Set<string> } | undefined {
	if (schema === undefined) return undefined;
	const json = toJsonSchema(schema, 'input', convert);
	const properties = json['properties'];
	if (properties === null || typeof properties !== 'object') return undefined;
	const required = Array.isArray(json['required'])
		? new Set(
				json['required'].filter(
					(key): key is string => typeof key === 'string',
				),
			)
		: new Set<string>();
	return { schemas: properties as Record<string, JsonSchema>, required };
}
