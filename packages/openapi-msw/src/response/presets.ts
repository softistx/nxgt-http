/**
 * The statuses `response` has a preset for: `response.ok(item)` is
 * `response(200).body(item)`. A preset exists on an operation's `response`
 * only when the operation declares its status.
 */
export const PRESETS = {
	ok: 200,
	created: 201,
	accepted: 202,
	noContent: 204,
	badRequest: 400,
	unauthorized: 401,
	forbidden: 403,
	notFound: 404,
	conflict: 409,
	unprocessableEntity: 422,
	tooManyRequests: 429,
	internalServerError: 500,
} as const;

export type Presets = typeof PRESETS;
