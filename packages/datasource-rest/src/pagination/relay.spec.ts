/** `relayPaginate`: a service's page as a Relay connection. */
import { describe, expect, it } from 'bun:test';
import { relayPaginate } from '../index';

describe('relayPaginate', () => {
	it('makes each item an edge, its id the cursor, and keeps the page info', () => {
		const pageInfo = {
			startCursor: 'a',
			endCursor: 'b',
			hasNextPage: true,
			totalElements: 7,
		};
		expect(
			relayPaginate({
				data: [{ id: 'a' }, { id: 'b' }],
				metadata: pageInfo,
			}),
		).toEqual({
			edges: [
				{ node: { id: 'a' }, cursor: 'a' },
				{ node: { id: 'b' }, cursor: 'b' },
			],
			pageInfo,
		});
	});

	it('reads a page with neither data nor metadata as an empty last page', () => {
		expect(relayPaginate({})).toEqual({
			edges: [],
			pageInfo: {
				startCursor: undefined,
				endCursor: undefined,
				hasNextPage: false,
				totalElements: 0,
			},
		});
	});
});
