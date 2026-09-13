import type { Context } from 'hono';

/**
 * Where a request value was read: a location Hono's `c.req.valid()` knows, or
 * `body` for a text body, which a handler reads with `c.req.text()`.
 */
export type ValidationTarget =
	| 'param'
	| 'query'
	| 'header'
	| 'json'
	| 'form'
	| 'body';

export interface ValidationIssue {
	target: ValidationTarget | 'response';
	/** Inside the target: `['items', 0, 'name']`, or `[]` for the whole of it. */
	path: (string | number)[];
	/**
	 * Zod's issue code, or one of the engine's own: `invalid_json`,
	 * `invalid_content_type`, `missing_body`, `undeclared_status`.
	 */
	code: string;
	message: string;
}

export interface ValidationFailure {
	/** A request the spec refuses, or, with `validateResponses`, a reply it does not declare. */
	kind: 'request' | 'response';
	operationId: string;
	method: string;
	/** As the spec writes it: `/employees/{id}`. */
	path: string;
	/** The reply's status, for a `response` failure. */
	status?: number;
	/** Every issue, from every target at once. */
	issues: ValidationIssue[];
}

/**
 * Answers a failure. Return a `Response` to send it, throw to hand the
 * failure to `app.onError`, or return nothing for the default answer.
 */
export type ValidationErrorHook = (
	failure: ValidationFailure,
	c: Context,
) => Response | undefined | Promise<Response | undefined>;

/**
 * The default answer: 400 for a request, 500 for a reply, shaped like
 * `ErrorResponse` with the issues added.
 */
export const validationErrorHandler = (
	failure: ValidationFailure,
	c: Context,
): Response => {
	const request = failure.kind === 'request';
	const status = request ? 400 : 500;
	return c.json(
		{
			status,
			message: request
				? 'errors.validation-failed'
				: 'errors.response-validation-failed',
			timestamp: new Date().toISOString(),
			issues: failure.issues,
		},
		status,
	);
};

/** What the engine reads of a Zod issue. */
export interface SchemaIssue {
	readonly path: readonly PropertyKey[];
	readonly code: string;
	readonly message: string;
}

export const toIssues = (
	target: ValidationIssue['target'],
	issues: readonly SchemaIssue[],
): ValidationIssue[] =>
	issues.map((issue) => ({
		target,
		path: issue.path.filter(
			(key): key is string | number => typeof key !== 'symbol',
		),
		code: issue.code,
		message: issue.message,
	}));
