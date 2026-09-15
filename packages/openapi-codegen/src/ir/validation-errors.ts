/**
 * The 400 `@nxgt/openapi-hono` answers a request with when its validators
 * refuse it: `{ status, message, timestamp, issues }`. The spec rarely says
 * so, and a client that checks its replies would refuse a reply the spec
 * does not describe. So it is declared on every operation the engine checks
 * a request for, beside the 400 the spec declares, if any.
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

/** Where the engine found a value wrong, as its `ValidationIssue` has it. */
const TARGETS = [
	'param',
	'query',
	'header',
	'json',
	'form',
	'body',
	'response',
];

const text: SchemaNode = { kind: 'string' };

const required = (name: string, schema: SchemaNode) => ({
	name,
	required: true,
	schema,
});

const ISSUE: ObjectNode = {
	kind: 'object',
	properties: [
		required('target', { kind: 'literal', values: TARGETS }),
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
	],
	additional: 'default',
	extends: [],
};

const BODY: ObjectNode = {
	kind: 'object',
	description:
		'The 400 `@nxgt/openapi-hono` answers a request with when its validators refuse it.',
	properties: [
		required('status', { kind: 'literal', values: [400] }),
		required('message', text),
		required('timestamp', { kind: 'string', format: 'date-time' }),
		required('issues', { kind: 'array', items: ISSUE }),
	],
	additional: 'default',
	extends: [],
};

/** Whether the engine may refuse a request: it checks parameters and a body, and nothing else. */
const checked = (operation: OperationIR): boolean =>
	operation.parameters.length > 0 || operation.body !== undefined;

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
 * `ir` with the engine's 400 declared on each operation that takes a
 * parameter or a body: a 400 of its own when the spec has none; in a union
 * with the schema of the media type its reply is read as, when the spec's
 * 400 has one; or as `application/json`, added to a 400 with no JSON.
 * `root` is the spec's root document, where the body's schema is said to be.
 */
export function withValidationErrors(ir: ApiIR, root: Location): ApiIR {
	if (!ir.operations.some(checked)) return ir;
	const location: Location = {
		file: root.file,
		pointer: '/x-nxgt-validation-error-body',
	};
	const schema: NamedSchema = {
		id: locationId(location),
		name: VALIDATION_ERROR_BODY,
		location,
		source: 'inline',
		node: BODY,
		recursive: false,
	};
	const ref: SchemaNode = { kind: 'ref', target: schema.id };
	const media: MediaIR = {
		mediaType: 'application/json',
		kind: 'json',
		schema: ref,
	};
	const declare = (operation: OperationIR): OperationIR => {
		if (!checked(operation)) return operation;
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
