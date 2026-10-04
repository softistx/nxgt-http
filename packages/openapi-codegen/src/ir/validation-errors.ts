/**
 * The 400 the server answers a request with when its validators refuse it:
 * `@nxgt/openapi-hono`'s `{ status, message, timestamp, issues }`, or
 * alxia's `{ error: 'validation', issues }`. The spec rarely says so, and a
 * client that checks its replies would refuse a reply the spec does not
 * describe. So it is declared on every operation the server checks a
 * request for, beside the 400 the spec declares, if any.
 */
import type { Location } from '../loader/location';
import { locationId } from '../loader/location';
import type {
	ApiIR,
	MediaIR,
	NamedSchema,
	ObjectNode,
	OperationIR,
	ResponseIR,
	SchemaNode,
} from './types';

/** The name the body is generated under: `ValidationErrorBody`, `zValidationErrorBody`. */
export const VALIDATION_ERROR_BODY = 'ValidationErrorBody';

/**
 * Which server answers a refused request: `@nxgt/openapi-hono`, alxia, or
 * either, when both `hono.ts` and `alxia.ts` are generated from one spec.
 */
export type ValidationServer = 'hono' | 'alxia' | 'both';

const text: SchemaNode = { kind: 'string' };

const required = (name: string, schema: SchemaNode) => ({
	name,
	required: true,
	schema,
});

const object = (
	properties: ObjectNode['properties'],
	description?: string,
): ObjectNode => ({
	kind: 'object',
	...(description !== undefined && { description }),
	properties,
	additional: 'default',
	extends: [],
});

/** An issue, `{ target, path, code, message }`, with the targets the server names. */
const issue = (targets: string[]): ObjectNode =>
	object([
		required('target', { kind: 'literal', values: targets }),
		required('path', {
			kind: 'array',
			items: {
				kind: 'union',
				variants: [text, { kind: 'number', integer: true }],
				exclusive: false,
			},
		}),
		required('code', text),
		required('message', text),
	]);

/** `@nxgt/openapi-hono`'s 400: `{ status, message, timestamp, issues }`, its `ValidationIssue` targets. */
const HONO_BODY: ObjectNode = object(
	[
		required('status', { kind: 'literal', values: [400] }),
		required('message', text),
		required('timestamp', { kind: 'string', format: 'date-time' }),
		required('issues', {
			kind: 'array',
			items: issue([
				'param',
				'query',
				'header',
				'json',
				'form',
				'body',
				'response',
			]),
		}),
	],
	'The 400 `@nxgt/openapi-hono` answers a request with when its validators refuse it.',
);

/**
 * alxia's 400: `@alxia/core`'s `ValidationErrorBody`, `{ error: 'validation',
 * issues }`, each issue's target one of the request parts it validates.
 */
const ALXIA_BODY: ObjectNode = object(
	[
		required('error', { kind: 'literal', values: ['validation'] }),
		required('issues', {
			kind: 'array',
			items: issue(['params', 'query', 'headers', 'cookies', 'body']),
		}),
	],
	"The 400 alxia answers a request with when a route's schemas refuse it.",
);

/** The body the server answers with: both in a union when either may. */
function bodyOf(server: ValidationServer): SchemaNode {
	if (server === 'hono') return HONO_BODY;
	if (server === 'alxia') return ALXIA_BODY;
	return {
		kind: 'union',
		description:
			'The 400 `@nxgt/openapi-hono` or alxia answers a request with when its validators refuse it: the spec is served by either.',
		variants: [HONO_BODY, ALXIA_BODY],
		exclusive: false,
	};
}

/**
 * Whether the server may refuse a request: it checks parameters and a
 * body, and nothing else. alxia checks cookies too; `@nxgt/openapi-hono`
 * does not read them.
 */
const checked = (operation: OperationIR, server: ValidationServer): boolean =>
	operation.parameters.length > 0 ||
	operation.body !== undefined ||
	(server !== 'hono' && operation.cookies.length > 0);

/**
 * The media type of a declared 400 that a client reads the engine's
 * `application/json` reply as, as `@nxgt/httpyz` picks it: itself, then
 * `application/*`, then `*\/*`, then the first JSON one, such as the
 * `application/problem+json` a handler's `c.json()` stands for too.
 */
const answeredAs = (content: readonly MediaIR[]): MediaIR | undefined =>
	content.find((m) => m.mediaType.toLowerCase() === 'application/json') ??
	content.find((m) => m.mediaType === 'application/*') ??
	content.find((m) => m.mediaType === '*/*') ??
	content.find((m) => m.kind === 'json');

/**
 * `ir` with the 400 of `server` declared on each operation that takes a
 * parameter or a body, or for alxia a cookie: a 400 of its own when the spec has none; in a union
 * with the schema of the media type its reply is read as, when the spec's
 * 400 has one; or as `application/json`, added to a 400 with no JSON.
 * `root` is the spec's root document, where the body's schema is said to be.
 */
export function withValidationErrors(
	ir: ApiIR,
	root: Location,
	server: ValidationServer = 'hono',
): ApiIR {
	if (!ir.operations.some((operation) => checked(operation, server))) {
		return ir;
	}
	const location: Location = {
		file: root.file,
		pointer: '/x-nxgt-validation-error-body',
	};
	const schema: NamedSchema = {
		id: locationId(location),
		name: VALIDATION_ERROR_BODY,
		location,
		source: 'inline',
		node: bodyOf(server),
		recursive: false,
	};
	const ref: SchemaNode = { kind: 'ref', target: schema.id };
	const media: MediaIR = {
		mediaType: 'application/json',
		kind: 'json',
		schema: ref,
	};
	const declare = (operation: OperationIR): OperationIR => {
		if (!checked(operation, server)) return operation;
		const declared = operation.responses.find((r) => r.status === 400);
		if (!declared) {
			const added: ResponseIR = {
				status: 400,
				description: 'The request, as the server refused it.',
				content: [media],
				location,
			};
			// In status order, as the spec most often lists them.
			const after = operation.responses.findIndex((r) => r.status > 400);
			const responses = [...operation.responses];
			responses.splice(after === -1 ? responses.length : after, 0, added);
			return { ...operation, responses };
		}
		const answered = answeredAs(declared.content);
		// Read unchecked already, as any JSON or bytes: nothing it would refuse.
		if (answered && !answered.schema) return operation;
		const content = answered?.schema
			? declared.content.map((m) =>
					m === answered && answered.schema
						? {
								...m,
								schema: {
									kind: 'union',
									variants: [answered.schema, ref],
									exclusive: false,
								} satisfies SchemaNode,
							}
						: m,
				)
			: [...declared.content, media];
		return {
			...operation,
			responses: operation.responses.map((r) =>
				r === declared ? { ...declared, content } : r,
			),
		};
	};
	return {
		...ir,
		// It depends on nothing: first, as dependencies come first.
		schemas: [schema, ...ir.schemas],
		operations: ir.operations.map(declare),
	};
}
