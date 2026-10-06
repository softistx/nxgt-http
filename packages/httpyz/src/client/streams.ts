/**
 * `events()` and `lines()`: a stream read as it arrives, over connections
 * the client opens and, for events, opens again.
 */
import { joinSignals } from '../cancel/abort';
import type { Middleware } from '../middleware/compose';
import type { StandardSchemaV1 } from '../schema/standard-schema';
import type { Open } from '../stream/connection';
import { eventStream } from '../stream/event-stream';
import { LINE_TYPES, lineStream } from '../stream/line-stream';
import type { ServerEvent } from '../stream/sse-parser';
import type { EventSchemas, ReconnectOptions } from '../stream/types';
import { build, type Given } from './build';
import { dispatch } from './dispatch';
import { type ClientState, contextOf, latestSignal } from './state';
import type { Method } from './types';

type StreamGiven = Given & {
	readonly method?: Method;
	readonly validate?: boolean;
	readonly decode?: boolean;
};

export type EventsGiven = StreamGiven & {
	readonly events?: EventSchemas;
	readonly onUnknownEvent?: (event: ServerEvent) => void;
	readonly reconnect?: boolean | ReconnectOptions;
	readonly lastEventId?: string;
};

export type LinesGiven = StreamGiven & { readonly item?: StandardSchemaV1 };

/** A stream reconnects by default, but for the methods a retry would not repeat. */
const RECONNECT_DELAY = 3000;

/**
 * A stream's connections, each built afresh: its headers are run again and
 * `Last-Event-ID` is added. `timeout` bounds one until its headers arrive,
 * and no longer, since a stream has no end to wait for.
 */
const opener =
	(
		state: ClientState,
		method: Method,
		path: string,
		call: Given,
		accept: string,
		added: readonly Middleware[],
	): Open =>
	async (stream, lastEventId) => {
		const built = await build(state, method, path, call, (headers) => {
			if (!headers.has('accept')) headers.set('accept', accept);
			if (lastEventId !== undefined) {
				headers.set('last-event-id', lastEventId);
			}
		});
		const deadline = new AbortController();
		const clock =
			built.timeout === undefined
				? undefined
				: setTimeout(
						() =>
							deadline.abort(
								new DOMException('The stream did not open', 'TimeoutError'),
							),
						built.timeout,
					);
		const signals = [stream, deadline.signal];
		if (built.signal) signals.push(built.signal);
		try {
			return await dispatch(
				state,
				new Request(built.url, {
					...built.init,
					signal: AbortSignal.any(signals),
				}),
				{
					context: built.context,
					timeout: built.timeout,
					deadline: deadline.signal,
					retry: built.retry,
					added,
				},
			);
		} finally {
			clearTimeout(clock);
		}
	};

export const events = (
	state: ClientState,
	path: string,
	given: EventsGiven,
	added: readonly Middleware[],
) => {
	const {
		events,
		onUnknownEvent,
		reconnect,
		lastEventId,
		validate = true,
		decode = true,
		method = 'get',
		latest,
		...own
	} = given;
	const call = {
		...own,
		signal: joinSignals(own.signal, latestSignal(state, latest)) ?? null,
	};
	const reconnects =
		reconnect === undefined
			? method !== 'post' && method !== 'patch'
			: reconnect !== false;
	const settings = typeof reconnect === 'object' ? reconnect : {};
	return eventStream({
		context: contextOf(method, path, call.operationId),
		open: opener(state, method, path, call, 'text/event-stream', added),
		signal: call.signal ?? undefined,
		validate,
		decode,
		events,
		onUnknownEvent,
		reconnect: reconnects && {
			attempts: settings.attempts ?? Number.POSITIVE_INFINITY,
			delay: settings.delay ?? RECONNECT_DELAY,
		},
		lastEventId,
	});
};

export const lines = (
	state: ClientState,
	path: string,
	given: LinesGiven,
	added: readonly Middleware[],
) => {
	const {
		item,
		validate = true,
		decode = true,
		method = 'get',
		latest,
		...own
	} = given;
	const call = {
		...own,
		signal: joinSignals(own.signal, latestSignal(state, latest)) ?? null,
	};
	return lineStream({
		context: contextOf(method, path, call.operationId),
		open: opener(
			state,
			method,
			path,
			call,
			LINE_TYPES.slice(0, 2).join(', '),
			added,
		),
		signal: call.signal ?? undefined,
		validate,
		decode,
		item,
	});
};
