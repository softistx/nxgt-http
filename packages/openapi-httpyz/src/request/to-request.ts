/**
 * An operation's input as a call of the core client, written the way
 * `@nxgt/openapi-hono` reads it back: a query list as a repeated key,
 * or joined with commas when the spec says `explode: false`; a header list
 * joined with commas; the body as the media type the spec declares for its
 * kind.
 */
import type { BodyInput } from '@nxgt/httpyz';
import {
	absent,
	text,
	toFormData,
	toSearchParams,
} from '@nxgt/httpyz/integration';
import type {
	RuntimeMedia,
	RuntimeOperation,
	RuntimeParameter,
} from '../client/types';

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

/** What to send as `Content-Type` for a declared media type, which may be a range. */
const concrete = (type: string | undefined, fallback: string): string =>
	type === undefined || type.includes('*') ? fallback : type;

/** The query and the body; the header parameters and the body's type go onto `headers`. */
export function toRequest(
	operation: RuntimeOperation,
	input: Input | undefined,
	headers: Headers,
): { query: URLSearchParams; body: BodyInput } {
	const query = new URLSearchParams();
	for (const param of operation.parameters) {
		if (param.in === 'query') {
			appendQuery(query, param, input?.query?.[param.name]);
		} else if (param.in === 'header') {
			const value = input?.header?.[param.name.toLowerCase()];
			if (absent(value)) continue;
			headers.set(
				param.name,
				Array.isArray(value) ? value.map(text).join(',') : text(value),
			);
		}
	}
	return { query, body: toBody(operation, input, headers) };
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

function toBody(
	operation: RuntimeOperation,
	input: Input | undefined,
	headers: Headers,
): BodyInput {
	if (input === undefined) return {};
	const content = Object.entries(operation.body?.content ?? {});
	const declared = (kind: RuntimeMedia['kind']): string | undefined =>
		content.find(([, media]) => media.kind === kind)?.[0];
	if (input.json !== undefined) {
		headers.set('content-type', concrete(declared('json'), 'application/json'));
		return { json: input.json };
	}
	if (input.form !== undefined) {
		return {
			form:
				declared('form') === 'application/x-www-form-urlencoded'
					? toSearchParams(input.form)
					: toFormData(input.form),
		};
	}
	if (input.text !== undefined) {
		headers.set('content-type', concrete(declared('text'), 'text/plain'));
		return { text: input.text };
	}
	if (input.body !== undefined) {
		headers.set(
			'content-type',
			concrete(declared('binary'), 'application/octet-stream'),
		);
		return { body: input.body };
	}
	return {};
}
