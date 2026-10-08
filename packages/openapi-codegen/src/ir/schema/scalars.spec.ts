import { describe, expect, it } from 'bun:test';
import { Diagnostics } from '../../errors';
import type { Location } from '../../loader/location';
import type { NumberFormat, StringFormat } from '../types';
import { numberNode, stringNode } from './scalars';

const at: Location = { file: '/spec/openapi.json', pointer: '/s' };

const state = () => ({
	diagnostics: new Diagnostics(),
	warnedFormats: new Set<string>(),
});

const report = (diagnostics: Diagnostics) =>
	diagnostics.list.map(({ severity, code, message, pointer }) => ({
		severity,
		code,
		message,
		pointer,
	}));

describe('stringNode', () => {
	it('is a plain string with nothing to say', () => {
		expect(stringNode(state(), { type: 'string' }, at)).toEqual({
			kind: 'string',
		});
	});

	it('is binary for `format: binary`, and for an opaque media type with no encoding', () => {
		const s = state();
		expect(stringNode(s, { format: 'binary' }, at)).toEqual({ kind: 'binary' });
		expect(stringNode(s, { contentMediaType: 'image/png' }, at)).toEqual({
			kind: 'binary',
		});
	});

	it('keeps a text or JSON media type as a string', () => {
		const s = state();
		expect(stringNode(s, { contentMediaType: 'text/plain' }, at).kind).toBe(
			'string',
		);
		expect(
			stringNode(s, { contentMediaType: 'application/json' }, at).kind,
		).toBe('string');
		expect(
			stringNode(s, { contentMediaType: 'application/problem+json' }, at).kind,
		).toBe('string');
	});

	it('a media type with an encoding is text in that encoding, not a file', () => {
		expect(
			stringNode(
				{ ...state() },
				{ contentMediaType: 'image/png', contentEncoding: 'base64' },
				at,
			),
		).toEqual({ kind: 'string', format: 'byte' });
	});

	it('reads `format: byte` and `contentEncoding: base64` as the same format', () => {
		expect(stringNode(state(), { format: 'byte' }, at)).toEqual({
			kind: 'string',
			format: 'byte',
		});
		expect(stringNode(state(), { contentEncoding: 'base64' }, at)).toEqual({
			kind: 'string',
			format: 'byte',
		});
	});

	it('keeps each format Zod validates, without a diagnostic', () => {
		for (const format of [
			'date-time',
			'date',
			'time',
			'duration',
			'email',
			'uri',
			'uuid',
			'ipv4',
			'ipv6',
		]) {
			const s = state();
			expect(stringNode(s, { format }, at)).toEqual({
				kind: 'string',
				format: format as StringFormat,
			});
			expect(s.diagnostics.list).toEqual([]);
		}
	});

	it('warns once per unknown format, at its pointer, and checks a plain string', () => {
		const s = state();
		expect(stringNode(s, { format: 'hostname' }, at)).toEqual({
			kind: 'string',
		});
		stringNode(s, { format: 'hostname' }, { ...at, pointer: '/other' });
		stringNode(s, { format: 'iri' }, at);
		expect(report(s.diagnostics)).toEqual([
			{
				severity: 'warning',
				code: 'unknown_format',
				message:
					'format `hostname` is not validated; it is checked as a plain string',
				pointer: '/s/format',
			},
			{
				severity: 'warning',
				code: 'unknown_format',
				message:
					'format `iri` is not validated; it is checked as a plain string',
				pointer: '/s/format',
			},
		]);
	});

	it('does not warn of the format of an @nxgt/typespec scalar, and keeps its pattern', () => {
		const s = state();
		expect(
			stringNode(
				s,
				{ format: 'iban', pattern: '^[A-Z]{2}', 'x-nxgt-scalar': 'IBAN' },
				at,
			),
		).toEqual({ kind: 'string', pattern: '^[A-Z]{2}' });
		expect(s.diagnostics.list).toEqual([]);
	});

	it('leaves the standard format of an @nxgt/typespec scalar to its pattern, except date-time', () => {
		const s = state();
		const scalar = { 'x-nxgt-scalar': 'X', pattern: '^a$' };
		for (const format of ['email', 'uri', 'uuid', 'ipv4', 'byte', 'date']) {
			expect(stringNode(s, { ...scalar, format }, at)).toEqual({
				kind: 'string',
				pattern: '^a$',
			});
		}
		expect(
			stringNode(s, { ...scalar, contentEncoding: 'base64' }, at),
		).toEqual({ kind: 'string', pattern: '^a$' });
		expect(stringNode(s, { ...scalar, format: 'date-time' }, at)).toEqual({
			kind: 'string',
			format: 'date-time',
			pattern: '^a$',
		});
		expect(s.diagnostics.list).toEqual([]);
	});

	it('keeps the length bounds, and ignores one that is not a number', () => {
		expect(stringNode(state(), { minLength: 0, maxLength: 9 }, at)).toEqual({
			kind: 'string',
			minLength: 0,
			maxLength: 9,
		});
		expect(
			stringNode(state(), { minLength: '1', maxLength: null }, at),
		).toEqual({ kind: 'string' });
	});

	it('keeps a pattern, including one only the legacy syntax accepts', () => {
		const s = state();
		expect(stringNode(s, { pattern: '^a+$' }, at)).toEqual({
			kind: 'string',
			pattern: '^a+$',
		});
		// `\-` is an identity escape: a SyntaxError with the `u` flag, fine without.
		expect(stringNode(s, { pattern: '^\\-$' }, at)).toEqual({
			kind: 'string',
			pattern: '^\\-$',
		});
		expect(s.diagnostics.list).toEqual([]);
	});

	it('refuses a pattern that is no regular expression, and drops it', () => {
		const s = state();
		expect(stringNode(s, { pattern: '(' }, at)).toEqual({ kind: 'string' });
		expect(report(s.diagnostics)).toEqual([
			{
				severity: 'error',
				code: 'invalid_schema',
				message: '`pattern` is not a valid regular expression: (',
				pointer: '/s/pattern',
			},
		]);
	});
});

describe('numberNode', () => {
	it('says whether it is an integer', () => {
		expect(numberNode(state(), true, {}, at)).toEqual({
			kind: 'number',
			integer: true,
		});
		expect(numberNode(state(), false, {}, at)).toEqual({
			kind: 'number',
			integer: false,
		});
	});

	it('keeps each number format', () => {
		for (const format of ['int32', 'int64', 'float', 'double']) {
			expect(numberNode(state(), false, { format }, at)).toEqual({
				kind: 'number',
				integer: false,
				format: format as NumberFormat,
			});
		}
	});

	it('warns about an unknown format by what the schema is checked as', () => {
		const s = state();
		numberNode(s, true, { format: 'decimal' }, at);
		numberNode(s, false, { format: 'money' }, at);
		expect(report(s.diagnostics).map((d) => d.message)).toEqual([
			'format `decimal` is not validated; it is checked as a plain integer',
			'format `money` is not validated; it is checked as a plain number',
		]);
	});

	it('shares the warned formats with strings: one warning for a format, whatever the type', () => {
		const s = state();
		stringNode(s, { format: 'x' }, at);
		numberNode(s, false, { format: 'x' }, at);
		expect(s.diagnostics.list).toHaveLength(1);
	});

	it('keeps the bounds and ignores one that is not a number', () => {
		expect(
			numberNode(
				state(),
				false,
				{
					minimum: 0,
					maximum: 10,
					multipleOf: 0.5,
					exclusiveMinimum: -1,
					exclusiveMaximum: 11,
				},
				at,
			),
		).toEqual({
			kind: 'number',
			integer: false,
			minimum: 0,
			maximum: 10,
			multipleOf: 0.5,
			exclusiveMinimum: -1,
			exclusiveMaximum: 11,
		});
		expect(
			numberNode(state(), false, { minimum: '0', exclusiveMaximum: 'x' }, at),
		).toEqual({ kind: 'number', integer: false });
	});

	it('refuses a boolean exclusive bound, which is OpenAPI 3.0, at its keyword', () => {
		const s = state();
		const node = numberNode(
			s,
			false,
			{ minimum: 1, exclusiveMinimum: true, exclusiveMaximum: false },
			at,
		);
		expect(node).toEqual({ kind: 'number', integer: false, minimum: 1 });
		expect(report(s.diagnostics)).toEqual([
			{
				severity: 'error',
				code: 'invalid_schema',
				message:
					'a boolean `exclusiveMinimum` is OpenAPI 3.0; in 3.1 it is the bound itself (`exclusiveMinimum: <number>`)',
				pointer: '/s/exclusiveMinimum',
			},
			{
				severity: 'error',
				code: 'invalid_schema',
				message:
					'a boolean `exclusiveMaximum` is OpenAPI 3.0; in 3.1 it is the bound itself (`exclusiveMaximum: <number>`)',
				pointer: '/s/exclusiveMaximum',
			},
		]);
	});
});
