/** What `http.events()` and `http.lines()` take, and what they yield. */
import type { CallOptions, Method } from '../client/types';
import type { SchemaData } from '../reply/types';
import type { StandardSchemaV1 } from '../schema/standard-schema';
import type { ServerEvent } from './sse-parser';

/** The events a stream declares, by name: a schema for JSON data, `null` for text. */
export type EventSchemas = {
	readonly [event: string]: StandardSchemaV1 | null;
};

/** A declared event, narrowed on `event`; any event, its data as text, when none is declared. */
export type StreamEvent<
	E extends EventSchemas | undefined,
	Decoded extends boolean = true,
> = E extends EventSchemas
	? {
			[Name in keyof E & string]: {
				readonly event: Name;
				readonly data: E[Name] extends StandardSchemaV1
					? SchemaData<E[Name], Decoded>
					: string;
				readonly id: string | undefined;
			};
		}[keyof E & string]
	: ServerEvent;

/** A line, as its schema checks it; `unknown` without one. */
export type StreamItem<
	I extends StandardSchemaV1 | undefined,
	Decoded extends boolean = true,
> = I extends StandardSchemaV1 ? SchemaData<I, Decoded> : unknown;

export interface ReconnectOptions {
	/** Reconnections in a row without an event before the stream gives up. Default: no limit. */
	attempts?: number;
	/** Milliseconds before reconnecting, until the stream sends a `retry:`. Default: 3000. */
	delay?: number;
}

interface StreamOptions<Decoded extends boolean> extends CallOptions {
	/** Default: `get`. */
	method?: Method;
	/** Checks each item with its schema, throwing a `ValidationError`. Default: `true`. */
	validate?: boolean;
	/** Yields what each schema outputs, rather than what it was given. Default: `true`. */
	decode?: Decoded;
}

export interface EventsOptions<
	E extends EventSchemas | undefined,
	Decoded extends boolean,
> extends StreamOptions<Decoded> {
	/**
	 * The events the stream sends, by name: `{ update: Item, ping: null }`.
	 * A schema checks the event's data as JSON; `null` keeps it as text.
	 * Without it, every event is yielded as it came, its data as text.
	 */
	events?: E;
	/** An event `events` does not declare, which is not yielded. */
	onUnknownEvent?: (event: ServerEvent) => void;
	/**
	 * Connects again when the connection drops or the stream ends, as
	 * `EventSource` does, sending the last event ID. Never after an error
	 * status or a 204. Default: on, but for POST and PATCH.
	 */
	reconnect?: boolean | ReconnectOptions;
	/** Sent as `Last-Event-ID` on the first connection: where to resume. */
	lastEventId?: string;
}

export interface LinesOptions<
	I extends StandardSchemaV1 | undefined,
	Decoded extends boolean,
> extends StreamOptions<Decoded> {
	/** Checks each line, as JSON. Without it, each line is yielded parsed, as `unknown`. */
	item?: I;
}

/** Read once, with `for await`. It connects when read. */
export interface Stream<T> extends AsyncIterable<T> {
	/** Ends it: the connection closes, and the loop reading it ends. */
	close(): void;
}

export interface EventStream<T> extends Stream<T> {
	/** The last event ID the stream set: what a reconnection sends. */
	readonly lastEventId: string | undefined;
}
