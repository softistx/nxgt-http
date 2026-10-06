/** A failed check, request or reply: the app's hook first, else the default reply. */
import type { Context } from 'hono';
import { type ValidationFailure, validationErrorHandler } from '../errors';
import type { Settings } from './types';

export async function fail(
	c: Context,
	settings: Settings,
	failure: ValidationFailure,
): Promise<Response> {
	const answer = await settings.onValidationError?.(failure, c);
	return answer instanceof Response
		? answer
		: validationErrorHandler(failure, c);
}
