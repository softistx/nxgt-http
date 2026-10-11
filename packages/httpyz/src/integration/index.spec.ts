import { describe, expect, it } from 'bun:test';
import { UndeclaredStatusError } from '../errors/errors';
import { createSseParser, type ServerEvent } from './index';

const code = 'PERSISTED_QUERY_NOT_FOUND';
const next = `event: next\ndata: {"errors":[{"extensions":{"code":"${code}"}}]}`;
const nextEvent: ServerEvent = {
	event: 'next',
	data: `{"errors":[{"extensions":{"code":"${code}"}}]}`,
	id: undefined,
};

/** The README's example, as written: the error's body through push and end. */
async function readError(body: string) {
	const error = new UndeclaredStatusError(
		{ method: 'post', path: '/graphql' } as never,
		new Response(body, {
			status: 404,
			headers: { 'content-type': 'text/event-stream' },
		}),
	);
	const parser = createSseParser();
	const text = await error.response.text();
	return [...parser.push(text), ...parser.end()];
}

describe('createSseParser, from the integration entry', () => {
	it('parses the next event graphql-yoga sends with a refused persisted query', () => {
		const events = createSseParser().push(
			`${next}\n\nevent: complete\ndata:\n\n`,
		);
		expect(events).toEqual([
			nextEvent,
			{ event: 'complete', data: '', id: undefined },
		]);
	});

	it('reads an error body with the README example, with the trailing blank line', async () => {
		expect(await readError(`${next}\n\n`)).toEqual([nextEvent]);
	});

	it('reads an error body with the README example, without it', async () => {
		expect(await readError(`${next}\n`)).toEqual([nextEvent]);
		expect(await readError(next)).toEqual([nextEvent]);
	});

	it('push alone completes nothing for a body without a blank line', () => {
		expect(createSseParser().push(`${next}\n`)).toEqual([]);
	});

	it('end returns nothing on an empty buffer', () => {
		expect(createSseParser().end()).toEqual([]);
	});

	it('end does not repeat an event a blank line completed', () => {
		const parser = createSseParser();
		expect(parser.push(`${next}\n\n`)).toEqual([nextEvent]);
		expect(parser.end()).toEqual([]);
		expect(parser.end()).toEqual([]);
	});
});
