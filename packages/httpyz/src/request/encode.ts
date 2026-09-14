/**
 * A call's input written onto its request: the path's `{name}`s filled in,
 * the query, and the body, whose kind sets its `Content-Type` unless the call
 * set one of its own.
 */
import type { CallContext } from '../errors/errors';
import type { BodyInput, FormFields, QueryInput } from './types';

/** A value as text: a `Date` as its ISO string. */
export const text = (value: unknown): string =>
	value instanceof Date ? value.toISOString() : String(value);

export const absent = (value: unknown): value is undefined | null =>
	value === undefined || value === null;

export function fillPath(
	context: CallContext,
	param: Readonly<Record<string, unknown>> | undefined,
): string {
	return context.path.replace(/\{([^}]+)\}/g, (_, name: string) => {
		const value = param?.[name];
		if (absent(value)) {
			throw new TypeError(
				`${context.method.toUpperCase()} ${context.path}: the path parameter ${name} is missing`,
			);
		}
		return encodeURIComponent(text(value));
	});
}

/** A list as a repeated key; `null` and `undefined` left out. */
export function writeQuery(query: QueryInput | undefined): string {
	if (query === undefined) return '';
	if (query instanceof URLSearchParams) return query.toString();
	const search = new URLSearchParams();
	for (const [name, value] of Object.entries(query)) {
		for (const item of Array.isArray(value) ? value : [value]) {
			if (!absent(item)) search.append(name, text(item));
		}
	}
	return search.toString();
}

export function joinUrl(
	baseUrl: string | URL | undefined,
	path: string,
	query: string,
): string {
	const root = baseUrl === undefined ? '' : String(baseUrl).replace(/\/+$/, '');
	return `${root}${path}${query === '' ? '' : `?${query}`}`;
}

/**
 * The body, with its `Content-Type` on `headers`: `own`, the one the call
 * set, or the one its kind needs, over any the client sends with every call.
 */
export function writeBody(
	input: BodyInput,
	headers: Headers,
	own: string | null,
): BodyInit | undefined {
	const type = (fallback: string) =>
		headers.set('content-type', own ?? fallback);
	if (input.json !== undefined) {
		type('application/json');
		return JSON.stringify(input.json);
	}
	if (input.form !== undefined) {
		// fetch writes the type: a multipart one carries its boundary.
		headers.delete('content-type');
		const { form } = input;
		if (form instanceof FormData || form instanceof URLSearchParams) {
			return form;
		}
		return [...fields(form)].some(([, value]) => value instanceof Blob)
			? toFormData(form)
			: toSearchParams(form);
	}
	if (input.text !== undefined) {
		type('text/plain');
		return input.text;
	}
	if (input.body !== undefined) {
		const { body } = input;
		type(
			body instanceof Blob && body.type !== ''
				? body.type
				: 'application/octet-stream',
		);
		return body as BodyInit;
	}
	return undefined;
}

/** A form's fields: every item of a list, an object as JSON, a file as it is. */
export function* fields(form: FormFields): Generator<[string, string | Blob]> {
	for (const [name, value] of Object.entries(form)) {
		for (const item of Array.isArray(value) ? value : [value]) {
			if (absent(item)) continue;
			if (item instanceof Blob) yield [name, item];
			else if (typeof item === 'object' && !(item instanceof Date)) {
				yield [name, JSON.stringify(item)];
			} else yield [name, text(item)];
		}
	}
}

export function toFormData(form: FormFields): FormData {
	const data = new FormData();
	for (const [name, value] of fields(form)) data.append(name, value);
	return data;
}

export function toSearchParams(form: FormFields): URLSearchParams {
	const data = new URLSearchParams();
	for (const [name, value] of fields(form)) {
		if (value instanceof Blob) {
			throw new TypeError(
				`${name} is a file: an application/x-www-form-urlencoded body cannot carry one`,
			);
		}
		data.append(name, value);
	}
	return data;
}
