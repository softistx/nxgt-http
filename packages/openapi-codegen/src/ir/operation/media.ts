import type { MediaKind } from '../types';

export function mediaKind(mediaType: string): MediaKind {
	const type = (mediaType.split(';')[0] ?? '').trim().toLowerCase();
	if (
		type === 'application/json' ||
		/^application\/[\w.-]+\+json$/.test(type)
	) {
		return 'json';
	}
	if (
		type === 'application/x-www-form-urlencoded' ||
		type === 'multipart/form-data'
	) {
		return 'form';
	}
	return type.startsWith('text/') ? 'text' : 'binary';
}

const JSON_LINES = new Set([
	'application/jsonl',
	'application/x-ndjson',
	'application/ndjson',
	'application/jsonlines',
	'application/x-jsonlines',
	'application/json-seq',
]);

/** A reply read an item at a time: `sse` or `jsonl`, or `undefined` for any other. */
export function sequentialKind(mediaType: string): 'sse' | 'jsonl' | undefined {
	const type = (mediaType.split(';')[0] ?? '').trim().toLowerCase();
	if (type === 'text/event-stream') return 'sse';
	return JSON_LINES.has(type) ? 'jsonl' : undefined;
}

/** A JSON Schema `contentMediaType` that says the string holds JSON. */
export const isJsonText = (media: unknown): boolean =>
	typeof media === 'string' && mediaKind(media) === 'json';
