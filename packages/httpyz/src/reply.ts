/** A response read into one of the replies the spec declares. */
import {
	type CallContext,
	ReplyStatusError,
	UndeclaredStatusError,
	ValidationError,
	type ValidationIssue,
} from './errors';
import { check } from './standard';
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

export interface ReplySettings {
	/** Checks a JSON or text reply with its schema. */
	readonly validate: boolean;
	/** Returns what the schema outputs, not what it was given. */
	readonly decode: boolean;
}

export async function readReply(
	context: CallContext,
	operation: RuntimeOperation,
	response: Response,
	settings: ReplySettings = { validate: false, decode: false },
): Promise<unknown> {
	const { status } = response;
	const declared = operation.responses[status];
	if (!declared) throw new UndeclaredStatusError(context, response);
	const types = Object.keys(declared);
	if (types.length === 0) {
		return { status, type: undefined, data: undefined, response };
	}
	const refused = (issues: ValidationIssue[]): ValidationError =>
		new ValidationError(context, {
			kind: 'response',
			operationId: context.operationId,
			method: context.method,
			path: context.path,
			status,
			issues,
		});
	const failure = (code: string, message: string): ValidationError =>
		refused([{ target: 'response', path: [], code, message }]);
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
	const reply = (data: unknown) => ({ status, type, data, response });
	/** As `/hono` checks a reply with `validateResponses`: JSON and text only. */
	const settle = async (data: unknown) => {
		if (!settings.validate || !media.schema) return reply(data);
		const result = await check(media.schema, data, 'response');
		if (!result.ok) throw refused(result.issues);
		return reply(settings.decode ? result.value : data);
	};
	switch (media.kind) {
		case 'json': {
			const text = await response.text();
			// Empty is no JSON: a checked reply says so, as the server does.
			if (text === '' && !settings.validate) return reply(undefined);
			let data: unknown;
			try {
				data = JSON.parse(text);
			} catch {
				throw failure('invalid_json', `the ${status} reply is not valid JSON`);
			}
			return settle(data);
		}
		case 'text':
			return settle(await response.text());
		case 'form':
			return reply(await response.formData());
		default:
			return reply(await response.blob());
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
