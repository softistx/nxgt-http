/**
 * A call's input written onto a request, the way `@nxgt/openapi-codegen/hono`
 * reads it back: a list in the query is a repeated key when `explode`, else
 * one value joined with commas; a list in a header is joined with commas.
 */
import type { RuntimeMedia, RuntimeOperation, RuntimeParameter } from './types';

/** What an input may hold, as `ClientOperations` types it. */
export interface Input {
	readonly param?: Readonly<Record<string, unknown>>;
	readonly query?: Readonly<Record<string, unknown>>;
	/** Keyed by lowercased name. */
	readonly header?: Readonly<Record<string, unknown>>;
	readonly json?: unknown;
	readonly form?: Readonly<Record<string, unknown>>;
	readonly text?: string;
	readonly body?: Blob | ArrayBuffer | Uint8Array;
}

/** A value as text: a `Date` as its ISO string. */
const text = (value: unknown): string =>
	value instanceof Date ? value.toISOString() : String(value);

const absent = (value: unknown): value is undefined | null =>
	value === undefined || value === null;

/** The URL and body of a call; its headers go onto `headers`. */
export function encodeRequest(
	operation: RuntimeOperation,
	input: Input | undefined,
	headers: Headers,
	baseUrl: string | URL | undefined,
): { url: string; body: BodyInit | undefined } {
	const path = operation.path.replace(/\{([^}]+)\}/g, (_, name: string) => {
		const value = input?.param?.[name];
		if (absent(value)) {
			throw new TypeError(
				`${operation.method.toUpperCase()} ${operation.path}: the path parameter ${name} is missing`,
			);
		}
		return encodeURIComponent(text(value));
	});
	const search = new URLSearchParams();
	for (const param of operation.parameters) {
		if (param.in === 'query') {
			appendQuery(search, param, input?.query?.[param.name]);
		} else if (param.in === 'header') {
			const value = input?.header?.[param.name.toLowerCase()];
			if (absent(value)) continue;
			headers.set(
				param.name,
				Array.isArray(value) ? value.map(text).join(',') : text(value),
			);
		}
	}
	const query = search.toString();
	const root = baseUrl === undefined ? '' : String(baseUrl).replace(/\/+$/, '');
	return {
		url: `${root}${path}${query === '' ? '' : `?${query}`}`,
		body: encodeBody(operation, input, headers),
	};
}

function appendQuery(
	search: URLSearchParams,
	param: RuntimeParameter,
	value: unknown,
): void {
	if (absent(value)) return;
	if (!Array.isArray(value)) search.append(param.name, text(value));
	else if (param.explode) {
		for (const item of value) search.append(param.name, text(item));
	} else search.append(param.name, value.map(text).join(','));
}

/** What to send as `Content-Type` for a declared media type, which may be a range. */
const concrete = (type: string | undefined, fallback: string): string =>
	type === undefined || type.includes('*') ? fallback : type;

function encodeBody(
	operation: RuntimeOperation,
	input: Input | undefined,
	headers: Headers,
): BodyInit | undefined {
	if (input === undefined) return undefined;
	const content = Object.entries(operation.body?.content ?? {});
	const declared = (kind: RuntimeMedia['kind']): string | undefined =>
		content.find(([, media]) => media.kind === kind)?.[0];
	// The body's own type wins over one the client's headers set for every call.
	if (input.json !== undefined) {
		headers.set('content-type', concrete(declared('json'), 'application/json'));
		return JSON.stringify(input.json);
	}
	if (input.form !== undefined) {
		// fetch writes the type: a multipart one carries the boundary.
		headers.delete('content-type');
		return declared('form') === 'application/x-www-form-urlencoded'
			? urlEncoded(input.form)
			: multipart(input.form);
	}
	if (input.text !== undefined) {
		headers.set('content-type', concrete(declared('text'), 'text/plain'));
		return input.text;
	}
	if (input.body !== undefined) {
		headers.set(
			'content-type',
			concrete(declared('binary'), 'application/octet-stream'),
		);
		return input.body as BodyInit;
	}
	return undefined;
}

/** A form's fields: every item of a list, an object as JSON, a file as it is. */
function* fields(
	form: Readonly<Record<string, unknown>>,
): Generator<[string, string | Blob]> {
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

function multipart(form: Readonly<Record<string, unknown>>): FormData {
	const data = new FormData();
	for (const [name, value] of fields(form)) data.append(name, value);
	return data;
}

function urlEncoded(form: Readonly<Record<string, unknown>>): URLSearchParams {
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
