/** `send()`: a `Request` the caller built, given the client's headers and middleware. */
import { joinSignals } from '../cancel/abort';
import type { Middleware } from '../middleware/compose';
import { dispatch, withDeadline } from './dispatch';
import {
	type ClientState,
	contextOf,
	latestSignal,
	sharedHeaders,
} from './state';
import type { SendOptions } from './types';

export const send = async (
	state: ClientState,
	request: Request,
	{
		timeout = state.options.timeout,
		retry = state.options.retry,
		operationId,
		latest,
	}: SendOptions,
	added: readonly Middleware[],
): Promise<Response> => {
	const replaced = latestSignal(state, latest);
	const method = request.method.toLowerCase();
	const context = contextOf(method, new URL(request.url).pathname, operationId);
	const headers = await sharedHeaders(state);
	request.headers.forEach((value, name) => {
		headers.set(name, value);
	});
	const { deadline, signal } = withDeadline(
		timeout,
		joinSignals(request.signal, replaced),
	);
	const sent = new Request(request, {
		headers,
		...(signal ? { signal } : {}),
	});
	return dispatch(state, sent, { context, timeout, deadline, retry, added });
};
