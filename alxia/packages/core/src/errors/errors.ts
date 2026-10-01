/** Where a refused value was read from. */
export type ValidationTarget = 'params' | 'query' | 'headers' | 'body';

export interface ValidationIssue {
	readonly target: ValidationTarget;
	readonly path: readonly (string | number)[];
	readonly code: string;
	readonly message: string;
}

/** The body of the 400 every route that validates its request may answer. */
export interface ValidationErrorBody {
	readonly error: 'validation';
	readonly issues: readonly ValidationIssue[];
}

/** The body of the 500 any route may answer. Nothing of the error leaks. */
export interface InternalErrorBody {
	readonly error: 'internal';
}

/** The body of the 404 and 405 the app answers outside every route. */
export interface RoutingErrorBody {
	readonly error: 'not_found' | 'method_not_allowed';
}

/**
 * An error a handler or a hook throws to answer with `status` and `body`.
 *
 * Prefer returning `reply(status, body)`: a reply is part of the route's
 * type, and the client sees it. A thrown `HttpError` is not, so the client
 * reads it as a status the route never declared.
 */
export class HttpError<
	Status extends number = number,
	Body = unknown,
> extends Error {
	override readonly name = 'HttpError';
	readonly status: Status;
	readonly body: Body;

	constructor(status: Status, body: Body, message?: string) {
		super(message ?? `HTTP ${status}`);
		this.status = status;
		this.body = body;
	}
}

/**
 * A reply that did not match the schema its route declares for its status.
 * It is answered as a 500: the client must never read an undeclared shape.
 */
export class ResponseValidationError extends Error {
	override readonly name = 'ResponseValidationError';
	readonly status: number;
	readonly issues: readonly ValidationIssue[];

	constructor(
		method: string,
		path: string,
		status: number,
		issues: readonly ValidationIssue[],
	) {
		super(
			`${method} ${path}: the ${status} reply does not match its schema: ${issues
				.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
				.join('; ')}`,
		);
		this.status = status;
		this.issues = issues;
	}
}
