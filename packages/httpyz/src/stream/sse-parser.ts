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
	/** Reads a chunk of text, and returns the events it completed. */
	push(chunk: string): ServerEvent[];
	/** The last `retry:` the stream set, in milliseconds. */
	readonly retry: number | undefined;
	/** The last event ID an event was dispatched with: what `Last-Event-ID` sends. */
	readonly lastEventId: string | undefined;
}

const LINE_END = /\r\n|\r|\n/g;

/** A parser for one connection; `lastEventId` carries over from the last one. */
export function createSseParser(lastEventId?: string): SseParser {
	let buffer = '';
	let started = false;
	/** A chunk ended on a CR, so a LF opening the next one ends nothing. */
	let afterCr = false;
	let data = '';
	let type = '';
	let id = lastEventId ?? '';
	let dispatchedId = lastEventId;
	let retry: number | undefined;

	const dispatch = (events: ServerEvent[]) => {
		dispatchedId = id === '' ? undefined : id;
		if (data === '') {
			type = '';
			return;
		}
		events.push({
			event: type === '' ? 'message' : type,
			data: data.endsWith('\n') ? data.slice(0, -1) : data,
			id: dispatchedId,
		});
		data = '';
		type = '';
	};

	const line = (text: string, events: ServerEvent[]) => {
		if (text === '') return dispatch(events);
		if (text.startsWith(':')) return;
		const colon = text.indexOf(':');
		const field = colon === -1 ? text : text.slice(0, colon);
		let value = colon === -1 ? '' : text.slice(colon + 1);
		if (value.startsWith(' ')) value = value.slice(1);
		switch (field) {
			case 'event':
				type = value;
				break;
			case 'data':
				data += `${value}\n`;
				break;
			case 'id':
				if (!value.includes('\0')) id = value;
				break;
			case 'retry':
				if (/^\d+$/.test(value)) retry = Number(value);
				break;
		}
	};

	return {
		push(chunk) {
			let text = chunk;
			if (!started && text !== '') {
				started = true;
				if (text.startsWith('\uFEFF')) text = text.slice(1);
			}
			if (afterCr && text !== '') {
				afterCr = false;
				if (text.startsWith('\n')) text = text.slice(1);
			}
			buffer += text;
			const events: ServerEvent[] = [];
			let start = 0;
			LINE_END.lastIndex = 0;
			for (
				let end = LINE_END.exec(buffer);
				end !== null;
				end = LINE_END.exec(buffer)
			) {
				// A CR last in the buffer may be half of a CRLF: the next chunk says.
				if (end[0] === '\r' && end.index === buffer.length - 1) {
					afterCr = true;
				}
				line(buffer.slice(start, end.index), events);
				start = end.index + end[0].length;
			}
			buffer = buffer.slice(start);
			return events;
		},
		get retry() {
			return retry;
		},
		get lastEventId() {
			return dispatchedId;
		},
	};
}
