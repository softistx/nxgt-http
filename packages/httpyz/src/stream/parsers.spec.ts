/**
 * The parsers against a corpus: each case is the chunks a stream arrives in,
 * and what `EventSource` would make of them.
 */
import { describe, expect, it } from 'bun:test';
import { createLineParser } from './line-parser';
import { createSseParser, type ServerEvent } from './sse-parser';

const message = (data: string, id?: string): ServerEvent => ({
	event: 'message',
	data,
	id,
});

/** Every event the chunks complete, fed one at a time. */
const parse = (chunks: string[], lastEventId?: string) => {
	const parser = createSseParser(lastEventId);
	const events = chunks.flatMap((chunk) => parser.push(chunk));
	return { events, retry: parser.retry, lastEventId: parser.lastEventId };
};

describe('the event stream parser', () => {
	const corpus: [string, string[], ServerEvent[]][] = [
		['one event', ['data: hello\n\n'], [message('hello')]],
		[
			'data lines joined with a line feed',
			['data: YHOO\ndata: +2\ndata: 10\n\n'],
			[message('YHOO\n+2\n10')],
		],
		[
			'a named event',
			['event: add\ndata: 73857293\n\n'],
			[{ event: 'add', data: '73857293', id: undefined }],
		],
		[
			'one space after the colon removed, and only one',
			['data:x\n\ndata:  y\n\n'],
			[message('x'), message(' y')],
		],
		['a comment', [': ping\n\n'], []],
		[
			'a field without a colon, and an empty data line',
			['data\n\ndata\ndata\n\ndata:'],
			[message(''), message('\n')],
		],
		['CRLF', ['data: a\r\n\r\n'], [message('a')]],
		['CR', ['data: a\r\rdata: b\r\r'], [message('a'), message('b')]],
		[
			'a CRLF split across two chunks is one line end',
			['data: a\r', '\ndata: b\r\n\r\n'],
			[message('a\nb')],
		],
		[
			'a line split across chunks',
			['da', 'ta: he', 'llo\n', '\n'],
			[message('hello')],
		],
		['a BOM first', ['\uFEFFdata: x\n\n'], [message('x')]],
		[
			'a BOM later is part of the line',
			['data: x\n\n', '\uFEFFdata: y\n\n'],
			[message('x')],
		],
		['an unknown field', ['foo: bar\ndata: x\n\n'], [message('x')]],
		[
			'the event type reset after each event',
			['event: a\ndata: 1\n\ndata: 2\n\n'],
			[{ event: 'a', data: '1', id: undefined }, message('2')],
		],
		[
			'an event type without data dispatches nothing, and resets',
			['event: a\n\ndata: 1\n\n'],
			[message('1')],
		],
		[
			'an id carried over to later events',
			['id: 7\ndata: a\n\ndata: b\n\n'],
			[message('a', '7'), message('b', '7')],
		],
		[
			'an empty id resets it',
			['id: 7\ndata: a\n\nid\ndata: b\n\n'],
			[message('a', '7'), message('b')],
		],
		[
			'an id with a NUL is ignored',
			['id: 7\ndata: a\n\nid: 8\0\ndata: b\n\n'],
			[message('a', '7'), message('b', '7')],
		],
		['an event without its blank line is dropped', ['data: x\n'], []],
	];

	for (const [name, chunks, events] of corpus) {
		it(name, () => {
			expect(parse(chunks).events).toEqual(events);
		});
	}

	it('reads retry: digits only', () => {
		expect(parse(['retry: 1500\n']).retry).toBe(1500);
		expect(parse(['retry: 1500\nretry: 1.5\nretry: x\n']).retry).toBe(1500);
		expect(parse(['retry: -1\n']).retry).toBeUndefined();
	});

	it('sets the last event ID even when no event is dispatched', () => {
		expect(parse(['id: 5\n\n']).lastEventId).toBe('5');
		// Not before the blank line that dispatches it.
		expect(parse(['id: 5\n']).lastEventId).toBeUndefined();
		expect(parse(['data: a\n\n'], '4').events).toEqual([message('a', '4')]);
	});
});

describe('the line parser', () => {
	const lines = (chunks: string[]) => {
		const parser = createLineParser();
		return [...chunks.flatMap((chunk) => parser.push(chunk)), ...parser.end()];
	};

	it('splits on LF and CRLF, across chunks, and skips blank lines', () => {
		expect(lines(['{"a":1}\n{"a"', ':2}\r\n\n  \n{"a":3}'])).toEqual([
			'{"a":1}',
			'{"a":2}',
			'{"a":3}',
		]);
	});

	it('splits a JSON text sequence on its record separator', () => {
		expect(lines(['\x1E{"a":1}\n\x1E{"a":2}\n'])).toEqual([
			'{"a":1}',
			'{"a":2}',
		]);
	});
});
