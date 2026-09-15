/**
 * A request read as `@nxgt/openapi-hono` reads it, with the validators of the
 * same generated table: each parameter as the text it travels as, a query list
 * as every value, the JSON as it parses, a form as its fields. The issues are
 * the server's, in its order, so a mock refuses what the server would, with
 * the same 400.
 */
import type { StandardSchemaV1, ValidationIssue } from '@nxgt/httpyz';
import { check } from '@nxgt/httpyz/integration';
import type { RuntimeMedia, RuntimeOperation } from '@nxgt/openapi-httpyz';

type Target = ValidationIssue['target'];

/** What a resolver receives of the request: each part as its validator outputs it. */
export interface Received {
	param: unknown;
	query: unknown;
	header: unknown;
	json?: unknown;
	form?: unknown;
	text?: string;
	body?: Blob;
}

export interface ReadRequest {
	received: Received;
	issues: ValidationIssue[];
}

/**
 * Reads `request`, whose path parameters `param` holds as MSW matched them.
 * A part that fails its validator is received as it came, beside its issues.
 */
export async function readRequest(
	operation: RuntimeOperation,
	request: Request,
	param: Readonly<Record<string, string>>,
): Promise<ReadRequest> {
	const issues: ValidationIssue[] = [];
	const run = async (
		target: Target,
		schema: StandardSchemaV1 | undefined,
		value: unknown,
	): Promise<unknown> => {
		if (!schema) return value;
		const result = await check(schema, value, target);
		if (result.ok) return result.value;
		issues.push(...result.issues);
		return value;
	};
	// In the engine's order, so the issues come out in the same one.
	const received: Received = {
		param: await run('param', operation.param, param),
		query: await run(
			'query',
			operation.query,
			readQuery(new URL(request.url).searchParams, operation, issues),
		),
		header: await run(
			'header',
			operation.header,
			readHeaders(request.headers, operation),
		),
	};
	if (operation.body) {
		Object.assign(
			received,
			await readBody(request.clone(), operation.body, issues, run),
		);
	}
	return { received, issues };
}

/**
 * Declared query parameters: a string each, or every value of a list. A key
 * that takes one value and is sent twice is an issue, as on the server.
 */
function readQuery(
	search: URLSearchParams,
	operation: RuntimeOperation,
	issues: ValidationIssue[],
): Record<string, unknown> {
	const query: Record<string, unknown> = {};
	for (const parameter of operation.parameters) {
		if (parameter.in !== 'query') continue;
		const values = search.getAll(parameter.name);
		if (parameter.list && parameter.explode) {
			if (values.length > 0) query[parameter.name] = values;
			continue;
		}
		if (values.length > 1) {
			issues.push({
				target: 'query',
				path: [parameter.name],
				code: 'repeated_parameter',
				message: `${parameter.name} is sent ${values.length} times, and takes one value`,
			});
		}
		const [value] = values;
		if (value !== undefined) {
			query[parameter.name] = parameter.list ? value.split(',') : value;
		}
	}
	return query;
}

/** Declared headers, keyed lowercased; a list split on commas. */
function readHeaders(
	headers: Headers,
	operation: RuntimeOperation,
): Record<string, unknown> {
	const read: Record<string, unknown> = {};
	for (const parameter of operation.parameters) {
		if (parameter.in !== 'header') continue;
		const value = headers.get(parameter.name);
		if (value === null) continue;
		read[parameter.name.toLowerCase()] = parameter.list
			? value.split(',').map((item) => item.trim())
			: value;
	}
	return read;
}

const mediaType = (header: string): string =>
	(header.split(';')[0] ?? '').trim().toLowerCase();

/** The declared media type for `type`: itself, else `type/*`, else `*\/*`. */
function match(
	content: { readonly [mediaType: string]: RuntimeMedia },
	type: string,
): RuntimeMedia | undefined {
	for (const [key, media] of Object.entries(content)) {
		if (key.toLowerCase() === type) return media;
	}
	return content[`${type.split('/')[0]}/*`] ?? content['*/*'];
}

const targetOf = (kind: RuntimeMedia['kind'] | undefined): Target =>
	kind === 'json' ? 'json' : kind === 'form' ? 'form' : 'body';

/** A form's fields, as Hono's `parseBody({ all: true })` gives them: a name sent twice is a list. */
function formFields(form: FormData): Record<string, unknown> {
	const fields: Record<string, unknown> = {};
	for (const [name, value] of form.entries()) {
		const before = fields[name];
		fields[name] =
			before === undefined
				? value
				: Array.isArray(before)
					? [...before, value]
					: [before, value];
	}
	return fields;
}

async function readBody(
	request: Request,
	body: NonNullable<RuntimeOperation['body']>,
	issues: ValidationIssue[],
	run: (
		target: Target,
		schema: StandardSchemaV1 | undefined,
		value: unknown,
	) => Promise<unknown>,
): Promise<Partial<Received>> {
	const declared = Object.keys(body.content).join(', ');
	const target = targetOf(Object.values(body.content)[0]?.kind);
	const absent = (at: Target): Partial<Received> => {
		if (body.required) {
			issues.push({
				target: at,
				path: [],
				code: 'missing_body',
				message: `A request body is required: ${declared}`,
			});
		}
		return {};
	};
	const header = request.headers.get('content-type');
	if (header === null) {
		if ((await request.text()) === '') return absent(target);
		issues.push({
			target,
			path: [],
			code: 'invalid_content_type',
			message: `A request body needs a Content-Type: ${declared}`,
		});
		return {};
	}
	const type = mediaType(header);
	const media = match(body.content, type);
	if (!media) {
		issues.push({
			target,
			path: [],
			code: 'invalid_content_type',
			message: `Content-Type ${type} is not one of ${declared}`,
		});
		return {};
	}
	switch (media.kind) {
		case 'json': {
			const text = await request.text();
			if (text === '') return absent('json');
			let value: unknown;
			try {
				value = JSON.parse(text);
			} catch {
				issues.push({
					target: 'json',
					path: [],
					code: 'invalid_json',
					message: 'The request body is not valid JSON',
				});
				return {};
			}
			return { json: await run('json', media.schema, value) };
		}
		case 'form': {
			const bytes = await request.arrayBuffer();
			if (bytes.byteLength === 0) return absent('form');
			let value: Record<string, unknown>;
			try {
				const parsed = new Response(bytes, {
					headers: { 'content-type': header },
				});
				value = formFields(await parsed.formData());
			} catch {
				issues.push({
					target: 'form',
					path: [],
					code: 'invalid_form',
					message: `The request body is not a valid ${type} form`,
				});
				return {};
			}
			return { form: await run('form', media.schema, value) };
		}
		case 'text': {
			const text = await request.text();
			if (text === '') return absent('body');
			await run('body', media.schema, text);
			return { text };
		}
		default: {
			// As the engine: a length of 0 is no body.
			if (request.headers.get('content-length') === '0') return absent('body');
			return { body: await request.blob() };
		}
	}
}
