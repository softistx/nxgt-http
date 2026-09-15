import type { ValidationFailure } from '@nxgt/httpyz';

/**
 * A mock that replies as the spec does not declare: a status, a media type or
 * a body it does not have. Thrown from the handler, so MSW answers the request
 * with a 500 and the test that made it fails, instead of passing on a mock
 * that has drifted from the spec.
 */
export class MockReplyError extends Error {
	override name = 'MockReplyError';
	/** The same shape as a request's: `kind: 'response'`, with the reply's status and every issue. */
	readonly failure: ValidationFailure;

	constructor(failure: ValidationFailure) {
		const issues = failure.issues.map(
			(issue) =>
				`  ${[issue.target, ...issue.path].join('.')}: ${issue.message} (${issue.code})`,
		);
		super(
			`${failure.operationId} (${failure.method.toUpperCase()} ${failure.path}): a mocked ${failure.status} reply the spec does not declare\n${issues.join('\n')}`,
		);
		this.failure = failure;
	}
}
