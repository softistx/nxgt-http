/** A service's page, and the Relay connection a GraphQL schema serves it as. */
export interface PageInfo {
	/** The cursor of the first item in the result set. */
	startCursor?: string | undefined;
	/** The cursor of the last item in the result set. */
	endCursor?: string | undefined;
	/** Whether there are more items after the current page. */
	hasNextPage: boolean;
	/** The number of items across all pages. */
	totalElements: number;
}

/** A page as the services send it. */
export type Paginated<T> = {
	data?: T[] | undefined;
	metadata?: PageInfo | undefined;
};

export type Edge<T> = {
	node: T;
	cursor: string;
};

export type Connection<T> = {
	edges: Edge<T>[];
	pageInfo: PageInfo;
};
