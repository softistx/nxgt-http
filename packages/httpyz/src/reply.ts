/** A response read into one of the replies the spec declares. */
import {
	type CallContext,
	ReplyStatusError,
	UndeclaredStatusError,
	ValidationError,
} from './errors';
import type { RuntimeMedia, RuntimeOperation } from './types';

const mediaType = (header: string): string =>
	(header.split(';')[0] ?? '').trim().toLowerCase();

const kindOf = (type: string): RuntimeMedia['kind'] | undefined =>
	type === 'application/json' || /^application\/[\w.-]+\+json$/.test(type)
		? 'json'
		: type.startsWith('text/')
			? 'text'
			: undefined;

/**
 * The declared media type a reply of `type` stands for: itself, then
 * `type/*`, then `*\/*`, then the first of the same kind, since what
 * `c.json()` sends, `application/json`, stands for a declared
 * `application/problem+json`.
 */
function declaredType(
	content: { readonly [mediaType: string]: RuntimeMedia },
	type: string,
): string | undefined {
	const types = Object.keys(content);
	const exact = types.find((key) => key.toLowerCase() === type);
	if (exact !== undefined) return exact;
	const range = `${type.split('/')[0]}/*`;
	if (content[range]) return range;
	if (content['*/*']) return '*/*';
	const kind = kindOf(type);
	return types.find((key) => content[key]?.kind === kind);
}

export async function readReply(
	context: CallContext,
	operation: RuntimeOperation,
	response: Response,
): Promise<unknown> {
	const { status } = response;
	const declared = operation.responses[status];
	if (!declared) throw new UndeclaredStatusError(context, response);
	const types = Object.keys(declared);
	if (types.length === 0) {
		return { status, type: undefined, data: undefined, response };
	}
	const failure = (code: string, message: string): ValidationError =>
		new ValidationError(context, {
			kind: 'response',
			operationId: context.operationId,
			method: context.method,
			path: context.path,
			status,
			issues: [{ target: 'response', path: [], code, message }],
		});
	const header = response.headers.get('content-type');
	// Untyped, it can only be the one type the status declares.
	const type =
		header === null
			? types.length === 1
				? types[0]
				: undefined
			: declaredType(declared, mediaType(header));
	const media = type === undefined ? undefined : declared[type];
	if (type === undefined || media === undefined) {
		throw failure(
			'invalid_content_type',
			`a ${status} reply is ${types.join(' or ')}, not ${header ?? 'untyped'}`,
		);
	}
	switch (media.kind) {
		case 'json': {
			const text = await response.text();
			if (text === '') return { status, type, data: undefined, response };
			try {
				return { status, type, data: JSON.parse(text), response };
			} catch {
				throw failure('invalid_json', `the ${status} reply is not valid JSON`);
			}
		}
		case 'text':
			return { status, type, data: await response.text(), response };
		case 'form':
			return { status, type, data: await response.formData(), response };
		default:
			return { status, type, data: await response.blob(), response };
	}
}

/**
 * The data of a reply with one of `statuses`, narrowed to theirs; any other
 * declared reply throws a `ReplyStatusError`.
 *
 * ```ts
 * const employee = unwrap(await api.get('/employees/{id}', { param: { id } }), 200);
 * ```
 */
export function unwrap<
	R extends { readonly status: number; readonly data: unknown },
	S extends R['status'],
>(reply: R, ...statuses: [S, ...S[]]): Extract<R, { status: S }>['data'] {
	if (!(statuses as readonly number[]).includes(reply.status)) {
		throw new ReplyStatusError(reply, statuses);
	}
	return reply.data as Extract<R, { status: S }>['data'];
}
