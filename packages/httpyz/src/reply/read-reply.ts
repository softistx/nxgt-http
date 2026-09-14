/** A response read into a reply: one the call declares, checked by its schema. */
import {
	type CallContext,
	UndeclaredStatusError,
	ValidationError,
	type ValidationIssue,
} from '../errors/errors';
import { check, type StandardSchemaV1 } from '../schema/standard-schema';
import {
	declaredType,
	type MediaKind,
	mediaKind,
	mediaType,
} from './media-type';
import type { Responses } from './types';

export interface ReplySettings {
	/** Checks a JSON or text reply with its schema. */
	readonly validate: boolean;
	/** Returns what the schema outputs, not what it was given. */
	readonly decode: boolean;
}

interface MediaSpec {
	readonly kind: MediaKind;
	readonly schema?: StandardSchemaV1;
}

/** `Responses` as the reader takes them: each status's media types, and how each is read. */
export type ReplySpec = {
	readonly [status: number]: { readonly [mediaType: string]: MediaSpec };
};

const isSchema = (value: unknown): value is StandardSchemaV1 =>
	typeof value === 'object' && value !== null && '~standard' in value;

export function toSpec(responses: Responses): ReplySpec {
	const spec: Record<number, Record<string, MediaSpec>> = {};
	for (const [status, declared] of Object.entries(responses)) {
		const content: Record<string, MediaSpec> = {};
		if (isSchema(declared)) {
			content['application/json'] = { kind: 'json', schema: declared };
		} else if (declared !== null) {
			for (const [type, schema] of Object.entries(declared)) {
				content[type] = {
					kind: mediaKind(type.toLowerCase()),
					...(schema === null ? {} : { schema }),
				};
			}
		}
		spec[Number(status)] = content;
	}
	return spec;
}

export async function readReply(
	context: CallContext,
	spec: ReplySpec | undefined,
	response: Response,
	settings: ReplySettings,
): Promise<unknown> {
	const { status } = response;
	const header = response.headers.get('content-type');
	const refused = (issues: ValidationIssue[]): ValidationError =>
		new ValidationError(context, {
			kind: 'response',
			...context,
			status,
			issues,
		});
	const failure = (code: string, message: string): ValidationError =>
		refused([{ target: 'response', path: [], code, message }]);
	const parse = (text: string): unknown => {
		try {
			return JSON.parse(text);
		} catch {
			throw failure('invalid_json', `the ${status} reply is not valid JSON`);
		}
	};

	if (!spec) {
		const type = header === null ? undefined : mediaType(header);
		const reply = (data: unknown) => ({ status, type, data, response });
		if (response.body === null) return reply(undefined);
		switch (type === undefined ? undefined : mediaKind(type)) {
			case 'json': {
				const text = await response.text();
				return reply(text === '' ? undefined : parse(text));
			}
			case 'form':
				return reply(await response.formData());
			case 'binary':
				return reply(await response.blob());
			default: {
				const text = await response.text();
				return reply(type === undefined && text === '' ? undefined : text);
			}
		}
	}

	const declared = spec[status];
	if (!declared) throw new UndeclaredStatusError(context, response);
	const types = Object.keys(declared);
	if (types.length === 0) {
		return { status, type: undefined, data: undefined, response };
	}
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
			if (text === '' && !(settings.validate && media.schema)) {
				return reply(undefined);
			}
			return settle(parse(text));
		}
		case 'text':
			return settle(await response.text());
		case 'form':
			return reply(await response.formData());
		default:
			return reply(await response.blob());
	}
}
