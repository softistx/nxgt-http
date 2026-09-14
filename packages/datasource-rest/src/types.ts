export type MediaType = `${string}/${string}`;

export type UpperHttpMethod =
	| 'GET'
	| 'PUT'
	| 'POST'
	| 'DELETE'
	| 'OPTIONS'
	| 'HEAD'
	| 'PATCH'
	| 'TRACE';

export type HttpMethod =
	| 'get'
	| 'put'
	| 'post'
	| 'delete'
	| 'options'
	| 'head'
	| 'patch'
	| 'trace';

export type ErrorResponse = {
	status?: number;
	message?: string;
	debugMessage?: string;
};

export interface PageInfo {
	/**
	 * The cursor of the first item in the result set.
	 */
	startCursor?: string;

	/**
	 * The cursor of the last item in the result set.
	 */
	endCursor?: string;

	/**
	 * Indicates whether there are more items after the current page.
	 */
	hasNextPage: boolean;

	/**
	 * The total number of elements across all pages.
	 */
	totalElements: number;
}

export type Paginated<T> = {
	data?: T[];
	metadata?: PageInfo;
};

export type Edge<T> = {
	node: T;
	cursor: string;
};

export type Connection<T> = {
	edges: Edge<T>[];
	pageInfo: PageInfo;
};
