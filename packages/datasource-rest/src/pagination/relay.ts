import type { Connection, Paginated } from './types';

/**
 * A service's `{ data, metadata }` page as a Relay connection: each item an
 * edge, its `id` the cursor. A page with neither is an empty last page.
 */
export function relayPaginate<T extends { id: string }>(
	page: Paginated<T>,
): Connection<T> {
	const { data: items, metadata } = page;
	return {
		edges: (items ?? []).map((item) => ({ node: item, cursor: item.id })),
		pageInfo: metadata ?? {
			startCursor: undefined,
			endCursor: undefined,
			hasNextPage: false,
			totalElements: 0,
		},
	};
}
