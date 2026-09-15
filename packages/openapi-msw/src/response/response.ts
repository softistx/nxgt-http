/**
 * `response`: a `Response` of a status the operation declares, its body
 * written as its media type carries it, and noted for the check against the
 * spec that follows the resolver.
 */
import type { ValidationIssue } from '@nxgt/httpyz';
import { check, toFormData, toSearchParams } from '@nxgt/httpyz/integration';
import type { RuntimeMedia, RuntimeOperation } from '@nxgt/openapi-httpyz';
import { passthrough } from 'msw';
import { MockReplyError } from '../errors/mock-reply-error';
import type { ResponseOptions } from '../mock/types';
import { PRESETS } from './presets';

export interface OperationContext {
	readonly operationId: string;
	readonly method: string;
	readonly path: string;
}

/** The media kinds each writer writes: `text` writes a stream of events too. */
const WRITERS = {
	json: ['json'],
	text: ['text', 'sse'],
	form: ['form'],
	binary: ['binary', 'jsonl'],
} as const;

type Writer = (...args: unknown[]) => Response;

/** What the types call `ResponseFactory`, untyped. */
export type RuntimeResponse = ((status: number) => Record<string, Writer>) &
	Record<string, unknown>;

/** What each response was written from, for the check that follows. */
const written = new WeakMap<
	Response,
	{ readonly media: RuntimeMedia; readonly data: unknown }
>();

export function createResponse(
	context: OperationContext,
	operation: RuntimeOperation,
): RuntimeResponse {
	const refuse = (status: number, code: string, message: string) =>
		new MockReplyError({
			kind: 'response',
			...context,
			status,
			issues: [{ target: 'response', path: [], code, message }],
		});

	const at = (status: number): Record<string, Writer> => {
		const declared = operation.responses[status];
		if (!declared) {
			throw refuse(
				status,
				'undeclared_status',
				`${context.operationId} declares no ${status} reply`,
			);
		}
		const types = Object.keys(declared);
		/** `body`, without `kinds`, writes any of the status's media types. */
		const writer =
			(kinds?: readonly string[], name = 'body'): Writer =>
			(...args) => {
				if (types.length === 0 && kinds === undefined) {
					const [options] = args as [ResponseOptions?];
					return new Response(null, {
						status,
						statusText: options?.statusText,
						headers: options?.headers,
					});
				}
				const [data, options] = args as [unknown, ResponseOptions?];
				const candidates = kinds
					? types.filter((type) => kinds.includes(declared[type]?.kind ?? ''))
					: types;
				const type = options?.type ?? candidates[0];
				const media =
					type !== undefined && candidates.includes(type)
						? declared[type]
						: undefined;
				if (type === undefined || !media) {
					throw refuse(
						status,
						'invalid_content_type',
						`A ${status} reply of ${context.operationId} is ` +
							`${types.join(' or ') || 'without content'}, not ${type ?? `a ${name} body`}`,
					);
				}
				const headers = new Headers(options?.headers);
				const response = new Response(write(media, type, data, headers), {
					status,
					statusText: options?.statusText,
					headers,
				});
				written.set(response, { media, data });
				return response;
			};
		const writers: Record<string, Writer> = { body: writer() };
		for (const [name, kinds] of Object.entries(WRITERS)) {
			writers[name] = writer(kinds, name);
		}
		return writers;
	};

	const response = ((status: number) => at(status)) as RuntimeResponse;
	for (const [name, status] of Object.entries(PRESETS)) {
		response[name] = (...args: unknown[]) =>
			(at(status).body as Writer)(...args);
	}
	response.untyped = (own: Response) => own;
	response.passthrough = () => passthrough();
	return response;
}

/** `data` as `type` carries it; the `Content-Type` is the declared one, unless `headers` has its own. */
function write(
	media: RuntimeMedia,
	type: string,
	data: unknown,
	headers: Headers,
): BodyInit | null {
	// A multipart body's type carries its boundary, which only the body knows.
	if (type !== 'multipart/form-data' && !headers.has('content-type')) {
		headers.set(
			'content-type',
			type.includes('*') ? 'application/octet-stream' : type,
		);
	}
	switch (media.kind) {
		case 'json':
			return JSON.stringify(data) ?? null;
		case 'text':
		case 'sse':
			return String(data);
		case 'form':
			if (data instanceof FormData || data instanceof URLSearchParams) {
				return data;
			}
			return type === 'multipart/form-data'
				? toFormData(data as Parameters<typeof toFormData>[0])
				: toSearchParams(data as Parameters<typeof toSearchParams>[0]);
		default:
			return data as BodyInit | null;
	}
}

/**
 * The issues of a response `response` wrote, against its schema: JSON as it
 * travels, `Date`s as their text, and text. Bodies read a part at a time and
 * binary ones have no schema to check; `untyped()` and `passthrough()` are
 * not checked.
 */
export async function checkResponse(
	response: Response,
): Promise<ValidationIssue[]> {
	const found = written.get(response);
	const schema = found?.media.schema;
	if (!found || !schema) return [];
	if (found.media.kind === 'json') {
		const text = JSON.stringify(found.data);
		const wire: unknown = text === undefined ? undefined : JSON.parse(text);
		const result = await check(schema, wire, 'response');
		return result.ok ? [] : result.issues;
	}
	if (found.media.kind === 'text') {
		const result = await check(schema, String(found.data), 'response');
		return result.ok ? [] : result.issues;
	}
	return [];
}
