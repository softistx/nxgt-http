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
	 * `invalid_form`, `invalid_content_type`, `missing_body`,
	 * `repeated_parameter`, `undeclared_status`.
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
 * The default answer: 400 for a request, shaped like `ErrorResponse` with the
 * issues added. A reply that fails is a 500 without them, since they name
 * what the reply held (an unrecognized `passwordHash`…): they go to
 * `console.error` instead.
 */
export const validationErrorHandler = (
	failure: ValidationFailure,
	c: Context,
): Response => {
	const timestamp = new Date().toISOString();
	if (failure.kind === 'response') {
		console.error(
			`${failure.operationId} (${failure.method.toUpperCase()} ${failure.path}) replied ${failure.status} as the spec does not declare:`,
			failure.issues,
		);
		return c.json(
			{ status: 500, message: 'errors.response-validation-failed', timestamp },
			500,
		);
	}
	return c.json(
		{
			status: 400,
			message: 'errors.validation-failed',
			timestamp,
			issues: failure.issues,
		},
		400,
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
