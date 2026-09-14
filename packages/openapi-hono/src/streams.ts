/**
 * `streamEvents()` and `streamLines()`: a reply sent an item at a time, as
 * the spec's `itemSchema` describes it, from the handler of the operation's
 * route. `hono.ts` binds them to the spec, so each item is typed by its
 * operation; with `validateResponses`, each is checked before it is sent.
 *
 * The body is written here rather than with `hono/streaming`, so that the
 * package still imports `hono` for types only.
 */
import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { type RunningRoute, runningRoute, type Validator } from './engine';
import { toIssues, type ValidationFailure } from './errors';

interface StreamWriter {
	/** Resolves after `ms` milliseconds: a pause between two items. */
	sleep(ms: number): Promise<void>;
	/** Whether the client went away: stop writing then. */
	readonly aborted: boolean;
	/** Runs when the client goes away. */
	onAbort(listener: () => void | Promise<void>): void;
}

export interface EventWriter<Event> extends StreamWriter {
	/** Sends an event: its data as JSON when the spec says it is JSON, as text otherwise. */
	write(event: Event): Promise<void>;
}

export interface LineWriter<Item> extends StreamWriter {
	/** Sends an item, as a line of JSON. */
	write(item: Item): Promise<void>;
}

/** What any event holds, whatever the spec: `hono.ts` narrows it per operation. */
interface OutgoingEvent {
	readonly event?: string;
	readonly data: unknown;
	readonly id?: string;
	readonly retry?: number;
}

/** A JSON text sequence's record separator, written before each record. */
const RS = String.fromCharCode(0x1e);

/** The route running `c`, and its 2xx reply of `kind`: its status, media type and validators. */
function streamOf(c: Context, id: string, kind: 'sse' | 'jsonl') {
	const route = runningRoute(c);
	if (route?.id !== id) {
		throw new Error(
			`${id}: stream its reply from the handler of its own route, registered with routes`,
		);
	}
	for (const [status, content] of Object.entries(route.operation.responses)) {
		const code = Number(status);
		if (code < 200 || code > 299) continue;
		for (const [type, media] of Object.entries(content)) {
			if (media.kind === kind) return { route, code, type, media };
		}
	}
	throw new Error(
		`${id} does not reply with ${kind === 'sse' ? 'server-sent events' : 'JSON lines'}`,
	);
}

/**
 * A streamed reply: `run` writes text to it until it returns, and it ends
 * then. A throw ends it too, and goes to `console.error`, since the status
 * went out with the first item. `aborted` turns true when the client cancels.
 */
function streamed(
	c: Context,
	status: number,
	headers: Record<string, string>,
	run: (
		send: (text: string) => Promise<void>,
		controls: StreamWriter,
	) => Promise<void>,
): Response {
	const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
	const writer = writable.getWriter();
	const encoder = new TextEncoder();
	const listeners: (() => void | Promise<void>)[] = [];
	let aborted = false;
	const abort = () => {
		if (aborted) return;
		aborted = true;
		for (const listener of listeners) void listener();
	};
	// A cancelled body errors the writable side.
	writer.closed.catch(abort);
	c.req.raw.signal?.addEventListener('abort', abort);
	const controls: StreamWriter = {
		sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
		get aborted() {
			return aborted;
		},
		onAbort: (listener) => {
			listeners.push(listener);
		},
	};
	const send = async (text: string) => {
		if (aborted) return;
		await writer.write(encoder.encode(text)).catch(abort);
	};
	void (async () => {
		try {
			await run(send, controls);
		} catch (error) {
			console.error(error);
		} finally {
			await writer.close().catch(() => {});
		}
	})();
	return c.body(readable, status as ContentfulStatusCode, headers);
}

/**
 * With `validateResponses`, refuses an item its validator does not accept,
 * read back from the JSON it is sent as. The status is sent already, so the
 * failure goes to `onValidationError` for its side effects, and the stream
 * ends with an error.
 */
async function check(
	c: Context,
	route: RunningRoute,
	status: number,
	validator: Validator | null | undefined,
	json: string,
	what: string,
): Promise<void> {
	if (!route.settings.validateResponses || !validator) return;
	const result = validator.safeParse(JSON.parse(json));
	if (result.success) return;
	const { method, path } = route.operation;
	const failure: ValidationFailure = {
		kind: 'response',
		operationId: route.id,
		method,
		path,
		status,
		issues: toIssues('response', result.error.issues),
	};
	await route.settings.onValidationError?.(failure, c);
	throw new Error(
		`${route.id} (${method.toUpperCase()} ${path}) streamed ${what} the spec does not declare; the stream ends`,
		{ cause: failure },
	);
}

/** An event as the stream carries it: its fields, a `data:` per line, then a blank line. */
function frame(event: OutgoingEvent, data: string): string {
	for (const [field, value] of [
		['event', event.event],
		['id', event.id],
	] as const) {
		if (value !== undefined && /[\r\n]/.test(value)) {
			throw new Error(`An event's \`${field}\` cannot hold a line break`);
		}
	}
	const lines = [
		event.event === undefined ? undefined : `event: ${event.event}`,
		...data.split(/\r\n|\r|\n/).map((line) => `data: ${line}`),
		event.id === undefined ? undefined : `id: ${event.id}`,
		event.retry === undefined ? undefined : `retry: ${event.retry}`,
	];
	return `${lines.filter((line) => line !== undefined).join('\n')}\n\n`;
}

/**
 * Replies with server-sent events, from the handler of operation `id`. An
 * event's data is sent as JSON when the spec declares it JSON, and as text
 * otherwise; an event the spec does not declare throws.
 */
export function streamEvents<Event>(
	c: Context,
	id: string,
	write: (stream: EventWriter<Event>) => Promise<void>,
): Response {
	const { route, code, media } = streamOf(c, id, 'sse');
	const headers = {
		'content-type': 'text/event-stream',
		'cache-control': 'no-cache',
	};
	return streamed(c, code, headers, (send, controls) =>
		write({
			...controls,
			get aborted() {
				return controls.aborted;
			},
			async write(given) {
				const event = given as OutgoingEvent;
				const name = event.event ?? 'message';
				const validator = media.events?.[name];
				if (media.events && validator === undefined) {
					throw new Error(`${id} declares no \`${name}\` event`);
				}
				const data = validator
					? JSON.stringify(event.data)
					: String(event.data);
				await check(c, route, code, validator, data, `a \`${name}\` event`);
				await send(frame(event, data));
			},
		}),
	);
}

/**
 * Replies with JSON lines, from the handler of operation `id`: one JSON text
 * a line, as the media type the spec declares, after a record separator for
 * `application/json-seq`.
 */
export function streamLines<Item>(
	c: Context,
	id: string,
	write: (stream: LineWriter<Item>) => Promise<void>,
): Response {
	const { route, code, type, media } = streamOf(c, id, 'jsonl');
	const prefix = type.toLowerCase().startsWith('application/json-seq')
		? RS
		: '';
	return streamed(c, code, { 'content-type': type }, (send, controls) =>
		write({
			...controls,
			get aborted() {
				return controls.aborted;
			},
			async write(item) {
				const json = JSON.stringify(item);
				await check(c, route, code, media.item, json, 'a line');
				await send(`${prefix}${json}\n`);
			},
		}),
	);
}
