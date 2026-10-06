import { describe, expect, it } from 'bun:test';
import { isJsonText, mediaKind, sequentialKind } from './media';

describe('mediaKind', () => {
	it('sorts media types into json, form, text and binary', () => {
		expect(
			[
				'application/json',
				'application/problem+json; charset=utf-8',
				'multipart/form-data',
				'application/x-www-form-urlencoded',
				'text/plain',
				'application/octet-stream',
				'image/png',
			].map(mediaKind),
		).toEqual(['json', 'json', 'form', 'form', 'text', 'binary', 'binary']);
	});

	it('ignores case and parameters', () => {
		expect(mediaKind('Application/JSON ; charset=utf-8')).toBe('json');
		expect(mediaKind('TEXT/HTML')).toBe('text');
	});

	it('reads only `application/*+json` as a JSON suffix', () => {
		expect(mediaKind('text/foo+json')).toBe('text');
		expect(mediaKind('application/vnd.api+json')).toBe('json');
	});
});

describe('sequentialKind', () => {
	it('reads events and JSON lines as streams', () => {
		expect(
			[
				'text/event-stream; charset=utf-8',
				'application/jsonl',
				'application/x-ndjson',
				'application/json-seq',
				'application/json',
				'text/plain',
			].map(sequentialKind),
		).toEqual(['sse', 'jsonl', 'jsonl', 'jsonl', undefined, undefined]);
	});

	it('knows every JSON Lines spelling', () => {
		expect(
			[
				'application/ndjson',
				'application/jsonlines',
				'application/x-jsonlines',
			].map(sequentialKind),
		).toEqual(['jsonl', 'jsonl', 'jsonl']);
	});
});

describe('isJsonText', () => {
	it('is true for a string naming a JSON media type', () => {
		expect(isJsonText('application/json')).toBe(true);
		expect(isJsonText('application/problem+json')).toBe(true);
	});

	it('is false for any other media type, and for a non-string', () => {
		expect(isJsonText('text/plain')).toBe(false);
		expect(isJsonText(undefined)).toBe(false);
		expect(isJsonText(1)).toBe(false);
	});
});
