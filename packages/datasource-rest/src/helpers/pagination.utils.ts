import type { Connection, Paginated } from '../types';

export function relayPaginate<T extends { id: string }>(
	data: Paginated<T>,
): Connection<T> {
	const { data: items, metadata } = data;
	return {
		edges: (items ?? []).map((item) => ({
			node: item,
			cursor: item.id,
		})),
		pageInfo: metadata ?? {
			startCursor: undefined,
			endCursor: undefined,
			hasNextPage: false,
			totalElements: 0,
		},
	};
}
