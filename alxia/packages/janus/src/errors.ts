import { alxia, type BaseContext } from '@alxia/core';
import {
	JanusError,
	type JanusErrorCode,
	type JanusErrorStatus,
	statusOf,
} from '@nxgt/janus';

/**
 * The body a refusal is answered with: its `code`, and only what the client
 * can act on. Never `reason`, `login`, a hash prefix or a cause: those are
 * for your logs. `@nxgt/janus-hono`'s `bodyOf`, kept twice on purpose.
 */
export interface JanusErrorBody {
	readonly code: JanusErrorCode;
	readonly issues?: JanusError['issues'];
	readonly minLength?: number;
	readonly attemptsLeft?: number;
	readonly retryAfter?: number;
}

export function bodyOf(error: JanusError): JanusErrorBody {
	switch (error.code) {
		case 'USER_INVALID':
			return { code: error.code, issues: error.issues ?? [] };
		case 'PASSWORD_TOO_SHORT':
			return error.minLength === undefined
				? { code: error.code }
				: { code: error.code, minLength: error.minLength };
		case 'CODE_INVALID':
			return error.attemptsLeft === undefined
				? { code: error.code }
				: { code: error.code, attemptsLeft: error.attemptsLeft };
		case 'CREDENTIALS_INVALID':
			return error.retryAfter === undefined
				? { code: error.code }
				: { code: error.code, retryAfter: error.retryAfter };
		default:
			return { code: error.code };
	}
}

export interface JanusErrorsOptions {
	/**
	 * Called with every `JanusError` answered 5xx — `STORE_FAILED` and the
	 * like, the server's to fix — before it is answered. It cannot stop the
	 * answer: one that throws is a warning, and the 503 is sent all the same.
	 */
	readonly report?: (error: JanusError, ctx: BaseContext) => unknown;
}

/**
 * Janus's errors answered, as a plugin: every `JanusError` a route declared
 * after it throws — a sign-in refused, a login taken, a store down — is
 * answered with janus's status and `bodyOf(error)`, typed on those routes.
 * A throttled sign-in carries `Retry-After`. Anything else goes on to the
 * app's next `onError`, or its 500.
 *
 * **`STORE_FAILED` is a 503**, never a 401 or a 404: an outage is not an
 * answer.
 */
export function janusErrors(options: JanusErrorsOptions = {}) {
	return alxia().onError((error, ctx) => {
		if (!(error instanceof JanusError)) return undefined;
		const status: JanusErrorStatus = statusOf(error.code);
		if (status >= 500 && options.report !== undefined) {
			Promise.resolve()
				.then(() => options.report?.(error, ctx))
				.catch((failure: unknown) =>
					process.emitWarning(
						`janusErrors(): report failed: ${String(failure)}`,
					),
				);
		}
		const body = bodyOf(error);
		return ctx.reply(
			status,
			body,
			error.retryAfter === undefined
				? {}
				: { headers: { 'retry-after': String(error.retryAfter) } },
		);
	});
}

export { statusOf };
