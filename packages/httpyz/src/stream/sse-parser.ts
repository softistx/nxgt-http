/**
 * The event stream format, parsed as `EventSource` parses it: text in,
 * events out. It follows WHATWG's "interpreting an event stream":
 * https://html.spec.whatwg.org/multipage/server-sent-events.html#event-stream-interpretation
 */

/** An event, as the stream sent it: its `data` is text. */
export interface ServerEvent {
	/** Its `event:` field, or `message` when the stream names none. */
	readonly event: string;
	/** Its `data:` lines, joined with a line feed. */
	readonly data: string;
	/** The last `id:` the stream set, carried over to every later event. */
	readonly id: string | undefined;
}

export interface SseParser {
	/**
	 * Reads a chunk of text, and returns the events it completed: only those
	 * a blank line ended, as `EventSource` dispatches them.
	 */
	push(chunk: string): ServerEvent[];
	/**
	 * For a body the server has finished: reads an unterminated last line as a
	 * line, then dispatches the event still pending. `EventSource` discards an
	 * incomplete event at the end of the stream; call this only when the body
	 * is whole, such as an error reply's text. It returns nothing after a
	 * complete event, so it never repeats one.
	 */
	end(): ServerEvent[];
	/** The last `retry:` the stream set, in milliseconds. */
	readonly retry: number | undefined;
	/** The last event ID an event was dispatched with: what `Last-Event-ID` sends. */
	readonly lastEventId: string | undefined;
}

interface State {
	buffer: string;
	started: boolean;
	/** A chunk ended on a CR, so a LF opening the next one ends nothing. */
	afterCr: boolean;
	data: string;
	type: string;
	id: string;
	dispatchedId: string | undefined;
	retry: number | undefined;
}

const LINE_END = /\r\n|\r|\n/g;

function dispatch(state: State, events: ServerEvent[]): void {
	state.dispatchedId = state.id === '' ? undefined : state.id;
	if (state.data !== '') {
		const { data } = state;
		events.push({
			event: state.type === '' ? 'message' : state.type,
			data: data.endsWith('\n') ? data.slice(0, -1) : data,
			id: state.dispatchedId,
		});
		state.data = '';
	}
	state.type = '';
}

function line(state: State, text: string, events: ServerEvent[]): void {
	if (text === '') {
		dispatch(state, events);
		return;
	}
	if (text.startsWith(':')) return;
	const colon = text.indexOf(':');
	const field = colon === -1 ? text : text.slice(0, colon);
	let value = colon === -1 ? '' : text.slice(colon + 1);
	if (value.startsWith(' ')) value = value.slice(1);
	switch (field) {
		case 'event':
			state.type = value;
			break;
		case 'data':
			state.data += `${value}\n`;
			break;
		case 'id':
			if (!value.includes('\0')) state.id = value;
			break;
		case 'retry':
			if (/^\d+$/.test(value)) state.retry = Number(value);
			break;
	}
}

function push(state: State, chunk: string): ServerEvent[] {
	let text = chunk;
	if (!state.started && text !== '') {
		state.started = true;
		if (text.startsWith('\uFEFF')) text = text.slice(1);
	}
	if (state.afterCr && text !== '') {
		state.afterCr = false;
		if (text.startsWith('\n')) text = text.slice(1);
	}
	state.buffer += text;
	const events: ServerEvent[] = [];
	const { buffer } = state;
	let start = 0;
	LINE_END.lastIndex = 0;
	for (
		let end = LINE_END.exec(buffer);
		end !== null;
		end = LINE_END.exec(buffer)
	) {
		// A CR last in the buffer may be half of a CRLF: the next chunk says.
		if (end[0] === '\r' && end.index === buffer.length - 1) {
			state.afterCr = true;
		}
		line(state, buffer.slice(start, end.index), events);
		start = end.index + end[0].length;
	}
	state.buffer = buffer.slice(start);
	return events;
}

function end(state: State): ServerEvent[] {
	const events: ServerEvent[] = [];
	if (state.buffer !== '') line(state, state.buffer, events);
	state.buffer = '';
	if (state.data !== '') dispatch(state, events);
	return events;
}

/** A parser for one connection; `lastEventId` carries over from the last one. */
export function createSseParser(lastEventId?: string): SseParser {
	const state: State = {
		buffer: '',
		started: false,
		afterCr: false,
		data: '',
		type: '',
		id: lastEventId ?? '',
		dispatchedId: lastEventId,
		retry: undefined,
	};
	return {
		push: (chunk) => push(state, chunk),
		end: () => end(state),
		get retry() {
			return state.retry;
		},
		get lastEventId() {
			return state.dispatchedId;
		},
	};
}
