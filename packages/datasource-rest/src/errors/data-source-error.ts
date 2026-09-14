/**
 * `DataSourceError`: every way a call to a service can fail, as one error
 * with a code a GraphQL server reports. It is the package's own, and depends
 * on no exception package of the app's: map it to yours where you catch it.
 */
import {
	NetworkError,
	ReplyStatusError,
	TimeoutError,
	UndeclaredStatusError,
	ValidationError,
} from '@nxgt/httpyz';

export type DataSourceErrorCode =
	| 'BAD_REQUEST'
	| 'UNAUTHENTICATED'
	| 'FORBIDDEN'
	| 'NOT_FOUND'
	| 'INTERNAL_SERVER_ERROR'
	| 'SERVICE_UNAVAILABLE';

export interface DataSourceErrorOptions extends ErrorOptions {
	readonly code: DataSourceErrorCode;
	readonly status?: number | undefined;
	readonly data?: unknown;
}

export class DataSourceError extends Error {
	override readonly name = 'DataSourceError';
	readonly code: DataSourceErrorCode;
	/** The status of the service's reply; none when no reply came back. */
	readonly status: number | undefined;
	/** The body of the service's reply, as it sent it, or the issues of a check that failed. */
	readonly data: unknown;
	/**
	 * What a GraphQL server reports with the error: graphql-js reads
	 * `extensions` off the error a resolver throws.
	 */
	readonly extensions: {
		readonly code: DataSourceErrorCode;
		readonly status: number | undefined;
	};

	constructor(
		message: string,
		{ code, status, data, ...options }: DataSourceErrorOptions,
	) {
		super(message, options);
		this.code = code;
		this.status = status;
		this.data = data;
		this.extensions = { code, status };
	}
}

/** The code of a reply's status: any 5xx is the service's failure, any other 4xx a bad request. */
export function codeOf(status: number): DataSourceErrorCode {
	if (status === 401) return 'UNAUTHENTICATED';
	if (status === 403) return 'FORBIDDEN';
	if (status === 404) return 'NOT_FOUND';
	if (status >= 500) return 'INTERNAL_SERVER_ERROR';
	return 'BAD_REQUEST';
}

/** The `message` of an error body, as the services write it, or `fallback`. */
const messageOf = (data: unknown, fallback: string): string =>
	typeof data === 'object' &&
	data !== null &&
	'message' in data &&
	typeof data.message === 'string' &&
	data.message !== ''
		? data.message
		: fallback;

/**
 * `error` as a `DataSourceError`, whatever the client threw. `data` is the
 * body of a reply the error does not carry: an `UndeclaredStatusError`'s,
 * which only a read of its response gives.
 */
export function toDataSourceError(
	error: unknown,
	data?: unknown,
): DataSourceError {
	if (error instanceof DataSourceError) return error;
	if (error instanceof ReplyStatusError) {
		return new DataSourceError(messageOf(error.data, error.message), {
			code: codeOf(error.status),
			status: error.status,
			data: error.data,
			cause: error,
		});
	}
	if (error instanceof UndeclaredStatusError) {
		return new DataSourceError(messageOf(data, error.message), {
			code: codeOf(error.status),
			status: error.status,
			data,
			cause: error,
		});
	}
	if (error instanceof NetworkError || error instanceof TimeoutError) {
		return new DataSourceError(error.message, {
			code: 'SERVICE_UNAVAILABLE',
			cause: error,
		});
	}
	if (error instanceof ValidationError) {
		// A request the spec refuses is the caller's fault; a reply it refuses, the service's.
		return new DataSourceError(error.message, {
			code:
				error.failure.kind === 'request'
					? 'BAD_REQUEST'
					: 'INTERNAL_SERVER_ERROR',
			data: error.failure.issues,
			cause: error,
		});
	}
	return new DataSourceError(
		error instanceof Error ? error.message : 'An error occurred',
		{ code: 'INTERNAL_SERVER_ERROR', cause: error },
	);
}
