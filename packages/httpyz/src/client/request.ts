/** A call that reads its reply: built, dispatched, and read against `responses`. */
import { isAbortError, joinSignals } from '../cancel/abort';
import { TimeoutError } from '../errors/errors';
import type { Middleware } from '../middleware/compose';
import { readReply, toSpec } from '../reply/read-reply';
import type { Responses } from '../reply/types';
import { build, type Given } from './build';
import { dispatch, timedOut, withDeadline } from './dispatch';
import { type ClientState, latestSignal } from './state';
import type { Method } from './types';

export type ReplyGiven = Given & {
	readonly responses?: Responses;
	readonly validate?: boolean;
	readonly decode?: boolean;
};

export const request = async (
	state: ClientState,
	method: Method,
	path: string,
	given: ReplyGiven,
	added: readonly Middleware[],
): Promise<unknown> => {
	const { responses, validate = true, decode = true, latest, ...call } = given;
	const replaced = latestSignal(state, latest);
	const built = await build(state, method, path, call);
	const { deadline, signal } = withDeadline(
		built.timeout,
		joinSignals(built.signal, replaced),
	);
	const response = await dispatch(
		state,
		new Request(built.url, { ...built.init, signal: signal ?? null }),
		{
			context: built.context,
			timeout: built.timeout,
			deadline,
			retry: built.retry,
			added,
		},
	);
	try {
		return await readReply(
			built.context,
			responses === undefined ? undefined : toSpec(responses),
			response,
			{ validate, decode },
		);
	} catch (error) {
		// The deadline covers the body too: fetch resolves at the headers, and
		// the signal then errors the body read with its own DOMException.
		// A caller's abort that came first stays as it is.
		if (
			built.timeout !== undefined &&
			timedOut(deadline, signal) &&
			isAbortError(error)
		) {
			throw new TimeoutError(
				built.context,
				built.timeout,
				{ cause: error },
				'body',
			);
		}
		throw error;
	}
};
