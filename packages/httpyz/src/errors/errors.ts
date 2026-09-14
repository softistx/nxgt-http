/** Which call failed: every error a call throws carries it. */
export interface CallContext {
	readonly method: string;
	/** As the caller wrote it: `/employees/{id}`. */
	readonly path: string;
	/** The call's name, when it was given one: an OpenAPI `operationId`. */
	readonly operationId?: string;
}

/** Where a value was found wrong, as `@nxgt/openapi-codegen/hono` reports it. */
export interface ValidationIssue {
	target: 'param' | 'query' | 'header' | 'json' | 'form' | 'body' | 'response';
	/** Inside the target: `['items', 0, 'name']`, or `[]` for the whole of it. */
	path: (string | number)[];
	code: string;
	message: string;
}

/** The same shape as the server's: one failure, every issue in it. */
export interface ValidationFailure {
	kind: 'request' | 'response';
	operationId?: string;
	method: string;
	path: string;
	status?: number;
	issues: ValidationIssue[];
}

/**
 * Every error a call throws, but an abort the caller asked for, which comes
 * through as the `AbortError` its signal gave.
 */
export class ClientError extends Error {
	override name = 'ClientError';
	readonly operationId: string | undefined;
	readonly method: string;
	readonly path: string;

	constructor(context: CallContext, message: string, options?: ErrorOptions) {
		const route = `${context.method.toUpperCase()} ${context.path}`;
		const call =
			context.operationId === undefined
				? route
				: `${context.operationId} (${route})`;
		super(`${call}: ${message}`, options);
		this.operationId = context.operationId;
		this.method = context.method;
		this.path = context.path;
	}
}

/** fetch failed: no connection, a refused one, a CORS refusal. The cause is fetch's error. */
export class NetworkError extends ClientError {
	override name = 'NetworkError';

	constructor(context: CallContext, options?: ErrorOptions) {
		super(context, 'no reply came back', options);
	}
}

export class TimeoutError extends ClientError {
	override name = 'TimeoutError';
	readonly timeout: number;

	constructor(context: CallContext, timeout: number, options?: ErrorOptions) {
		super(context, `no reply within ${timeout} ms`, options);
		this.timeout = timeout;
	}
}

/** A status the call's `responses` do not declare. */
export class UndeclaredStatusError extends ClientError {
	override name = 'UndeclaredStatusError';
	readonly status: number;
	/** Unread: its body is still there to read. */
	readonly response: Response;

	constructor(context: CallContext, response: Response) {
		super(context, `no ${response.status} reply is declared`);
		this.status = response.status;
		this.response = response;
	}
}

/**
 * A reply its declaration does not describe: an undeclared media type, JSON
 * that does not parse, a value its schema refuses; or a request refused
 * before it was sent.
 */
export class ValidationError extends ClientError {
	override name = 'ValidationError';
	readonly failure: ValidationFailure;

	constructor(context: CallContext, failure: ValidationFailure) {
		super(context, failure.issues.map((issue) => issue.message).join('; '));
		this.failure = failure;
	}
}

/** From `unwrap()`: a declared reply, but not one of the statuses asked for. */
export class ReplyStatusError extends Error {
	override name = 'ReplyStatusError';
	readonly status: number;
	readonly data: unknown;
	readonly response: Response | undefined;

	constructor(
		reply: { status: number; data: unknown; response?: Response },
		expected: readonly number[],
	) {
		super(`Expected a ${expected.join(' or ')} reply, got ${reply.status}`);
		this.status = reply.status;
		this.data = reply.data;
		this.response = reply.response;
	}
}
