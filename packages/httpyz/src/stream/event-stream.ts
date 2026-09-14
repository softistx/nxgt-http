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

export function eventStream(settings: EventSettings): EventStream<unknown> {
	const reading = new Reading(settings.signal);
	let lastEventId = settings.lastEventId;
	let delay = settings.reconnect ? settings.reconnect.delay : 0;
	let started = false;

	/** A declared event with its data checked, or `undefined` for one it does not declare. */
	const declared = async (raw: ServerEvent, status: number) => {
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
	};

	/** Whether to connect again after `failures` in a row, having waited for it. */
	const again = async (failures: number): Promise<boolean> => {
		const { reconnect } = settings;
		if (!reconnect || failures >= reconnect.attempts) return false;
		await pause(delay, reading.closer.signal, settings.signal);
		return !reading.stopped();
	};

	async function* run(): AsyncGenerator<unknown, void, undefined> {
		let failures = 0;
		try {
			for (;;) {
				let response: Response;
				try {
					response = await settings.open(reading.closer.signal, lastEventId);
				} catch (error) {
					if (reading.closer.signal.aborted) return;
					// Only a connection that failed may pass: not a timeout, an abort or a refusal.
					if (error instanceof NetworkError && (await again(failures++))) {
						continue;
					}
					throw error;
				}
				if (!(await opened(settings, response, ['text/event-stream']))) {
					return;
				}
				const parser = createSseParser(lastEventId);
				const reader = reading.read(response);
				let dropped: unknown;
				for (;;) {
					let chunk: Awaited<ReturnType<typeof reader.read>>;
					try {
						chunk = await reader.read();
					} catch (error) {
						if (reading.stopped()) return;
						dropped = error;
						break;
					}
					if (reading.stopped()) return;
					if (chunk.done) break;
					const events = parser.push(chunk.value);
					lastEventId = parser.lastEventId;
					delay = parser.retry ?? delay;
					for (const raw of events) {
						failures = 0;
						const event = await declared(raw, response.status);
						if (event !== undefined) yield event;
					}
				}
				if (!(await again(failures++))) {
					if (dropped === undefined) return;
					throw new NetworkError(settings.context, { cause: dropped });
				}
			}
		} finally {
			reading.release();
		}
	}

	return {
		[Symbol.asyncIterator]() {
			if (started) throw new TypeError('A stream is read once');
			started = true;
			return run();
		},
		close: () => reading.close(),
		get lastEventId() {
			return lastEventId;
		},
	};
}
