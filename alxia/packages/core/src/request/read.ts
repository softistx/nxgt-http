import type { ValidationIssue } from '../errors/errors';

/**
 * The query string as an object. A key given once is a string, a key given
 * more than once an array of them, so `z.array(...)` reads `?tag=a&tag=b`;
 * for a list that may hold one item, accept both (see the README).
 */
export function readQuery(url: URL): Record<string, string | string[]> {
	const query: Record<string, string | string[]> = {};
	for (const [key, value] of url.searchParams) {
		const seen = query[key];
		if (seen === undefined) query[key] = value;
		else if (typeof seen === 'string') query[key] = [seen, value];
		else seen.push(value);
	}
	return query;
}

/** The request headers as an object, names lowercased. */
export function readHeaders(headers: Headers): Record<string, string> {
	const read: Record<string, string> = {};
	for (const [key, value] of headers) read[key] = value;
	return read;
}

export type ReadBody =
	| { readonly ok: true; readonly value: unknown }
	| { readonly ok: false; readonly issue: ValidationIssue };

/**
 * The request body, read by its `content-type`: JSON, a form (an object of
 * its fields, a field given more than once an array), or text. Nothing else
 * is read: the handler takes it from `ctx.request`.
 */
export async function readBody(request: Request): Promise<ReadBody> {
	const type = request.headers.get('content-type')?.toLowerCase() ?? '';
	if (type.includes('json')) {
		const text = await request.text();
		if (text === '') return { ok: true, value: undefined };
		try {
			return { ok: true, value: JSON.parse(text) };
		} catch {
			return {
				ok: false,
				issue: {
					target: 'body',
					path: [],
					code: 'invalid_json',
					message: 'The body is not valid JSON',
				},
			};
		}
	}
	if (
		type.startsWith('multipart/form-data') ||
		type.startsWith('application/x-www-form-urlencoded')
	) {
		const form = await request.formData();
		const value: Record<string, FormDataEntryValue | FormDataEntryValue[]> = {};
		for (const [key, entry] of form) {
			const seen = value[key];
			if (seen === undefined) value[key] = entry;
			else if (Array.isArray(seen)) seen.push(entry);
			else value[key] = [seen, entry];
		}
		return { ok: true, value };
	}
	if (type.startsWith('text/'))
		return { ok: true, value: await request.text() };
	if (request.body === null) return { ok: true, value: undefined };
	return { ok: true, value: await request.arrayBuffer() };
}
