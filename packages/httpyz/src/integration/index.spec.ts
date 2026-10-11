import { describe, expect, it } from 'bun:test';
import { createSseParser, type ServerEvent } from './index';

describe('createSseParser, from the integration entry', () => {
	it('parses the next event graphql-yoga sends with a refused persisted query', () => {
		const body =
			'event: next\ndata: {"errors":[{"message":"PersistedQueryNotFound","extensions":{"code":"PERSISTED_QUERY_NOT_FOUND"}}]}\n\nevent: complete\ndata:\n\n';
		const events: ServerEvent[] = createSseParser().push(body);
		expect(events).toEqual([
			{
				event: 'next',
				data: '{"errors":[{"message":"PersistedQueryNotFound","extensions":{"code":"PERSISTED_QUERY_NOT_FOUND"}}]}',
				id: undefined,
			},
			{ event: 'complete', data: '', id: undefined },
		]);
		expect(JSON.parse(events[0]?.data ?? '').errors[0].extensions.code).toBe(
			'PERSISTED_QUERY_NOT_FOUND',
		);
	});
});
