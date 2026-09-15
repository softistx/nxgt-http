export { createOpenApiQueries } from './openapi/create-openapi-queries';
export type {
	MutationInit,
	OpenApiMutationOptions,
	OpenApiQueries,
	OperationData,
	OperationVariables,
	QueryNames,
} from './openapi/types';
// What the options take and return, as `@nxgt/httpyz-query` has them: one import is enough.
export type {
	HttpInfiniteQueryOptions,
	HttpQueryKey,
	HttpQueryOptions,
	KeyInput,
	Paging,
	QueriesOptions,
} from './queries/types';
