/**
 * `http.events()`: server-sent events over `fetch`. It reconnects as
 * `EventSource` does, but through the client, so each connection has its
 * `auth` and middleware, and its events are checked by their schemas.
 */
import { NetworkError } from '../errors/errors';
import {
	opened,
	pause,
	Reading,
	type StreamSettings,
	settle,
} from './connection';
import { createSseParser, type ServerEvent } from './sse-parser';
import type { EventSchemas, EventStream } from './types';

export interface EventSettings extends StreamSettings {
	readonly events: EventSchemas | undefined;
	readonly onUnknownEvent: ((event: ServerEvent) => void) | undefined;
	/** `false`, or how to reconnect. */
	readonly reconnect:
		| { readonly attempts: number; readonly delay: number }
		| false;
	readonly lastEventId: string | undefined;
}

/** What one stream is up to: its settings, its reading, and what survives a reconnection. */
interface Session {
	readonly settings: EventSettings;
	readonly reading: Reading;
	lastEventId: string | undefined;
	delay: number;
	/** Connections that failed or ended in a row, without an event. */
	failures: number;
}

/** A declared event with its data checked, or `undefined` for one it does not declare. */
async function declared(
	settings: EventSettings,
	raw: ServerEvent,
	status: number,
) {
	const { events } = settings;
	if (!events) return raw;
	if (!Object.hasOwn(events, raw.event)) {
		settings.onUnknownEvent?.(raw);
		return undefined;
	}
	const schema = events[raw.event];
	if (!schema) return raw;
	const what = `the ${raw.event} event's data`;
	const data = await settle(settings, status, raw.data, schema, what);
	return { event: raw.event, data, id: raw.id };
}

/** Whether to connect again after one more failure in a row, having waited for it. */
async function again(session: Session): Promise<boolean> {
	const { settings, reading } = session;
	const { reconnect } = settings;
	const failed = session.failures++;
	if (!reconnect || failed >= reconnect.attempts) return false;
	await pause(session.delay, reading.closer.signal, settings.signal);
	return !reading.stopped();
}

/**
 * Opens one connection: its reply, `'retry'` when it failed and the stream
 * reconnects, or `'end'` when the stream is over (closed, aborted, or a 204).
 */
async function connect(session: Session): Promise<Response | 'retry' | 'end'> {
	const { settings, reading } = session;
	let response: Response;
	try {
		response = await settings.open(reading.closer.signal, session.lastEventId);
	} catch (error) {
		if (reading.closer.signal.aborted) return 'end';
		// Only a connection that failed may pass: not a timeout, an abort or a refusal.
		if (error instanceof NetworkError && (await again(session))) return 'retry';
		throw error;
	}
	return (await opened(settings, response, ['text/event-stream']))
		? response
		: 'end';
}

/**
 * Yields the events of one reply. It returns `'end'` when the stream was
 * stopped, else how the reply ended: the error that dropped it, if any.
 */
async function* pump(
	session: Session,
	response: Response,
): AsyncGenerator<unknown, 'end' | { dropped: unknown }, undefined> {
	const { settings, reading } = session;
	const parser = createSseParser(session.lastEventId);
	const reader = reading.read(response);
	for (;;) {
		let chunk: Awaited<ReturnType<typeof reader.read>>;
		try {
			chunk = await reader.read();
		} catch (error) {
			return reading.stopped() ? 'end' : { dropped: error };
		}
		if (reading.stopped()) return 'end';
		if (chunk.done) return { dropped: undefined };
		const events = parser.push(chunk.value);
		session.lastEventId = parser.lastEventId;
		session.delay = parser.retry ?? session.delay;
		for (const raw of events) {
			session.failures = 0;
			const event = await declared(settings, raw, response.status);
			if (event !== undefined) yield event;
		}
	}
}

/** Reads connection after connection, reconnecting as the settings allow. */
async function* run(
	session: Session,
): AsyncGenerator<unknown, void, undefined> {
	try {
		for (;;) {
			const response = await connect(session);
			if (response === 'end') return;
			if (response === 'retry') continue;
			const outcome = yield* pump(session, response);
			if (outcome === 'end') return;
			if (!(await again(session))) {
				if (outcome.dropped === undefined) return;
				const cause = outcome.dropped;
				throw new NetworkError(session.settings.context, { cause });
			}
		}
	} finally {
		session.reading.release();
	}
}

export function eventStream(settings: EventSettings): EventStream<unknown> {
	const session: Session = {
		settings,
		reading: new Reading(settings.signal),
		lastEventId: settings.lastEventId,
		delay: settings.reconnect ? settings.reconnect.delay : 0,
		failures: 0,
	};
	let started = false;
	return {
		[Symbol.asyncIterator]() {
			if (started) throw new TypeError('A stream is read once');
			started = true;
			return run(session);
		},
		close: () => session.reading.close(),
		get lastEventId() {
			return session.lastEventId;
		},
	};
}
