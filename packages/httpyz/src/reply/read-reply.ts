/** A response read into a reply: one the call declares, checked by its schema. */
import {
	type CallContext,
	NetworkError,
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
	/** The call's signal: a body read it aborted fails as the abort, not as the network. */
	readonly signal?: AbortSignal | undefined;
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

/**
 * The body, read as text, bytes or a form. fetch resolves at the headers, so a
 * connection that drops while the body streams rejects the read with the
 * runtime's own TypeError: it is a NetworkError, unless the call's signal
 * aborted it.
 */
function bodyReaders(
	context: CallContext,
	response: Response,
	signal: AbortSignal | undefined,
) {
	const read = async <T>(reading: () => Promise<T>): Promise<T> => {
		try {
			return await reading();
		} catch (error) {
			if (signal?.aborted) throw error;
			throw new NetworkError(context, { cause: error }, 'body');
		}
	};
	return {
		readText: () => read(() => response.text()),
		readBlob: () => read(() => response.blob()),
		// The bytes first, so a form that does not parse keeps formData()'s own error.
		readForm: async () =>
			new Response(await read(() => response.arrayBuffer()), {
				headers: response.headers,
			}).formData(),
	};
}

/** What reading one response needs, built once by `readReply`. */
interface Reading {
	readonly context: CallContext;
	readonly status: number;
	readonly response: Response;
	readonly settings: ReplySettings;
	readonly readers: ReturnType<typeof bodyReaders>;
}

const reply = (
	{ status, response }: Reading,
	type: string | undefined,
	data: unknown,
) => ({ status, type, data, response });

const refused = (
	{ context, status }: Reading,
	issues: ValidationIssue[],
): ValidationError =>
	new ValidationError(context, {
		kind: 'response',
		...context,
		status,
		issues,
	});

const failure = (
	reading: Reading,
	code: string,
	message: string,
): ValidationError =>
	refused(reading, [{ target: 'response', path: [], code, message }]);

const parse = (reading: Reading, text: string): unknown => {
	try {
		return JSON.parse(text);
	} catch {
		throw failure(
			reading,
			'invalid_json',
			`the ${reading.status} reply is not valid JSON`,
		);
	}
};

/** As `/hono` checks a reply with `validateResponses`: JSON and text only. */
async function settle(
	reading: Reading,
	type: string,
	media: MediaSpec,
	data: unknown,
) {
	const { validate, decode } = reading.settings;
	if (!validate || !media.schema) return reply(reading, type, data);
	const result = await check(media.schema, data, 'response');
	if (!result.ok) throw refused(reading, result.issues);
	return reply(reading, type, decode ? result.value : data);
}

/** A call that declares nothing: the reply is read by what the server says it is. */
async function readUntyped(reading: Reading, header: string | null) {
	const { readText, readBlob, readForm } = reading.readers;
	const type = header === null ? undefined : mediaType(header);
	if (reading.response.body === null) return reply(reading, type, undefined);
	switch (type === undefined ? undefined : mediaKind(type)) {
		case 'json': {
			const text = await readText();
			return reply(
				reading,
				type,
				text === '' ? undefined : parse(reading, text),
			);
		}
		case 'form':
			return reply(reading, type, await readForm());
		case 'binary':
			return reply(reading, type, await readBlob());
		default: {
			const text = await readText();
			return reply(
				reading,
				type,
				type === undefined && text === '' ? undefined : text,
			);
		}
	}
}

/** The body of a declared type, read as that type's kind and checked by its schema. */
async function readDeclared(reading: Reading, type: string, media: MediaSpec) {
	const { readText, readBlob, readForm } = reading.readers;
	switch (media.kind) {
		case 'json': {
			const text = await readText();
			// Empty is no JSON: a checked reply says so, as the server does.
			if (text === '' && !(reading.settings.validate && media.schema)) {
				return reply(reading, type, undefined);
			}
			return settle(reading, type, media, parse(reading, text));
		}
		case 'text':
			return settle(reading, type, media, await readText());
		case 'form':
			return reply(reading, type, await readForm());
		default:
			return reply(reading, type, await readBlob());
	}
}

export async function readReply(
	context: CallContext,
	spec: ReplySpec | undefined,
	response: Response,
	settings: ReplySettings,
): Promise<unknown> {
	const { status } = response;
	const header = response.headers.get('content-type');
	const readers = bodyReaders(context, response, settings.signal);
	const reading: Reading = { context, status, response, settings, readers };
	if (!spec) return readUntyped(reading, header);

	const declared = spec[status];
	if (!declared) throw new UndeclaredStatusError(context, response);
	const types = Object.keys(declared);
	if (types.length === 0) return reply(reading, undefined, undefined);
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
			reading,
			'invalid_content_type',
			`a ${status} reply is ${types.join(' or ')}, not ${header ?? 'untyped'}`,
		);
	}
	return readDeclared(reading, type, media);
}
