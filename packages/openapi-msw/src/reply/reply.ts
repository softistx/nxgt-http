/**
 * `reply(status, data, init)`: a `Response` of a status the operation
 * declares, its body written as its media type carries it, and noted for the
 * check against the spec that follows the resolver.
 */
import type { ValidationIssue } from '@nxgt/httpyz';
import { check, toFormData, toSearchParams } from '@nxgt/httpyz/integration';
import type { RuntimeMedia, RuntimeOperation } from '@nxgt/openapi-httpyz';
import { MockReplyError } from '../errors/mock-reply-error';
import type { ReplyInit } from '../mock/types';

export interface OperationContext {
	readonly operationId: string;
	readonly method: string;
	readonly path: string;
}

/** What `reply()` wrote each response from, for the check that follows. */
const written = new WeakMap<
	Response,
	{ readonly media: RuntimeMedia; readonly data: unknown }
>();

export function createReply(
	context: OperationContext,
	operation: RuntimeOperation,
): (status: number, ...rest: unknown[]) => Response {
	const refuse = (status: number, code: string, message: string) =>
		new MockReplyError({
			kind: 'response',
			...context,
			status,
			issues: [{ target: 'response', path: [], code, message }],
		});
	return (status, ...rest) => {
		const declared = operation.responses[status];
		if (!declared) {
			throw refuse(
				status,
				'undeclared_status',
				`${context.operationId} declares no ${status} reply`,
			);
		}
		const types = Object.keys(declared);
		if (types.length === 0) {
			const [init] = rest as [ReplyInit?];
			return new Response(null, { status, headers: init?.headers });
		}
		const [data, init] = rest as [unknown, ReplyInit?];
		const type = init?.type ?? (types[0] as string);
		const media = declared[type];
		if (!media) {
			throw refuse(
				status,
				'invalid_content_type',
				`A ${status} reply of ${context.operationId} is ${types.join(' or ')}, not ${type}`,
			);
		}
		const headers = new Headers(init?.headers);
		const response = new Response(write(media, type, data, headers), {
			status,
			headers,
		});
		written.set(response, { media, data });
		return response;
	};
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
 * The issues of a reply `reply()` wrote, against its schema: JSON as it
 * travels, `Date`s as their text, and text. Bodies read a part at a time and
 * binary ones have no schema to check; a `Response` the resolver built itself
 * is not checked.
 */
export async function checkReply(
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
