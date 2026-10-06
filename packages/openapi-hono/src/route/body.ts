/**
 * The request body: chosen by `Content-Type`, read through Hono's cache,
 * then checked. A JSON, form or text body is read; any other is left for
 * the handler to stream.
 */
import type { Context } from 'hono';
import type { RuntimeMedia, RuntimeOperation } from '../engine';
import type { ValidationIssue, ValidationTarget } from '../errors';
import { check } from './check';
import { match, mediaType } from './media';
import type { Validated } from './types';

type Body = NonNullable<RuntimeOperation['body']>;

export async function readBody(
	c: Context,
	body: Body,
	issues: ValidationIssue[],
): Promise<void> {
	const header = c.req.header('content-type');
	if (header === undefined) return readUntyped(c, body, issues);
	const type = mediaType(header);
	const media = match(body.content, type);
	if (!media) {
		issues.push({
			target: targetOf(body),
			path: [],
			code: 'invalid_content_type',
			message: `Content-Type ${type} is not one of ${declared(body)}`,
		});
		return;
	}
	switch (media.kind) {
		case 'json':
			return readJson(c, body, media, issues);
		case 'form':
			return readForm(c, body, media, type, issues);
		case 'text':
			return readText(c, body, media, issues);
		default:
			// Left unread, for the handler to stream; a length of 0 is no body.
			if (c.req.header('content-length') === '0') {
				absent(c, body, issues, 'body');
			}
			return;
	}
}

/** The declared media types, for a message. */
const declared = (body: Body): string => Object.keys(body.content).join(', ');

/** The target an issue of the body is reported under, from its first media type. */
function targetOf(body: Body): ValidationTarget {
	const kind = Object.values(body.content)[0]?.kind;
	return kind === 'json' ? 'json' : kind === 'form' ? 'form' : 'body';
}

/** No body was sent: an issue when one is required, else an empty `c.req.valid()`. */
function absent(
	c: Context,
	body: Body,
	issues: ValidationIssue[],
	at: ValidationTarget,
): void {
	if (body.required) {
		issues.push({
			target: at,
			path: [],
			code: 'missing_body',
			message: `A request body is required: ${declared(body)}`,
		});
	} else if (at === 'json' || at === 'form') {
		c.req.addValidatedData(at, undefined as unknown as Validated);
	}
}

/** A request without a `Content-Type`: fine when it has no body. */
async function readUntyped(
	c: Context,
	body: Body,
	issues: ValidationIssue[],
): Promise<void> {
	if ((await read(c, () => c.req.text())) === '') {
		absent(c, body, issues, targetOf(body));
		return;
	}
	issues.push({
		target: targetOf(body),
		path: [],
		code: 'invalid_content_type',
		message: `A request body needs a Content-Type: ${declared(body)}`,
	});
}

async function readJson(
	c: Context,
	body: Body,
	media: RuntimeMedia,
	issues: ValidationIssue[],
): Promise<void> {
	const text = await read(c, () => c.req.text());
	if (text === '') return absent(c, body, issues, 'json');
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
		return;
	}
	if (media.schema) check(c, issues, 'json', media.schema, value);
	else c.req.addValidatedData('json', value as Validated);
}

async function readForm(
	c: Context,
	body: Body,
	media: RuntimeMedia,
	type: string,
	issues: ValidationIssue[],
): Promise<void> {
	// Read once, so parseBody takes Hono's cached copy of it.
	const bytes = await read(c, () => c.req.arrayBuffer());
	if (bytes.byteLength === 0) return absent(c, body, issues, 'form');
	let value: Awaited<ReturnType<Context['req']['parseBody']>>;
	try {
		value = await c.req.parseBody({ all: true });
	} catch {
		issues.push({
			target: 'form',
			path: [],
			code: 'invalid_form',
			message: `The request body is not a valid ${type} form`,
		});
		return;
	}
	if (media.schema) check(c, issues, 'form', media.schema, value);
	else c.req.addValidatedData('form', value);
}

async function readText(
	c: Context,
	body: Body,
	media: RuntimeMedia,
	issues: ValidationIssue[],
): Promise<void> {
	const text = await read(c, () => c.req.text());
	if (text === '') return absent(c, body, issues, 'body');
	if (media.schema) check(c, issues, 'body', media.schema, text);
}

/** Reads the body through Hono's cache, which a read of `c.req.raw` bypasses. */
async function read<T>(c: Context, body: () => Promise<T>): Promise<T> {
	try {
		return await body();
	} catch (error) {
		if (!c.req.raw.bodyUsed) throw error;
		throw new Error(
			'A middleware read the request body through c.req.raw before validation. Read it with c.req.json(), c.req.text() or c.req.arrayBuffer(), which Hono caches for the next reader',
			{ cause: error },
		);
	}
}
