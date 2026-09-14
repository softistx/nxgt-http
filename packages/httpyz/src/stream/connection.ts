/** What the two streams share: how a connection opens, and how its items are checked. */
import {
	type CallContext,
	UndeclaredStatusError,
	ValidationError,
	type ValidationIssue,
} from '../errors/errors';
import { mediaType } from '../reply/media-type';
import { check, type StandardSchemaV1 } from '../schema/standard-schema';

/**
 * Opens one connection through the client's `retry`, `auth` and `use`, and
 * resolves once the reply's headers have arrived. `lastEventId` is sent as
 * `Last-Event-ID`.
 */
export type Open = (
	signal: AbortSignal,
	lastEventId: string | undefined,
) => Promise<Response>;

export interface StreamSettings {
	readonly context: CallContext;
	readonly open: Open;
	/** The caller's own signal: its abort comes through as it is. */
	readonly signal: AbortSignal | undefined;
	readonly validate: boolean;
	readonly decode: boolean;
}

const failure = (
	context: CallContext,
	status: number,
	issues: ValidationIssue[],
): ValidationError =>
	new ValidationError(context, {
		kind: 'response',
		...context,
		status,
		issues,
	});

/**
 * Whether the reply opened a stream: `false` for a 204, which ends it. Any
 * other status but a 2xx throws, with its body unread, and a reply of
 * another media type is refused.
 */
export async function opened(
	settings: StreamSettings,
	response: Response,
	types: readonly string[],
): Promise<boolean> {
	const { status } = response;
	if (status === 204) {
		await response.body?.cancel();
		return false;
	}
	if (!response.ok) throw new UndeclaredStatusError(settings.context, response);
	const header = response.headers.get('content-type');
	if (header === null || !types.includes(mediaType(header)) || !response.body) {
		await response.body?.cancel();
		throw failure(settings.context, status, [
			{
				target: 'response',
				path: [],
				code: 'invalid_content_type',
				message: `a ${status} reply is ${types.join(' or ')}, not ${header ?? 'untyped'}`,
			},
		]);
	}
	return true;
}

/** A JSON text, through its schema as a reply is checked. */
export async function settle(
	settings: StreamSettings,
	status: number,
	text: string,
	schema: StandardSchemaV1 | undefined,
	what: string,
): Promise<unknown> {
	let value: unknown;
	try {
		value = JSON.parse(text);
	} catch {
		throw failure(settings.context, status, [
			{
				target: 'response',
				path: [],
				code: 'invalid_json',
				message: `${what} is not valid JSON`,
			},
		]);
	}
	if (!schema || !settings.validate) return value;
	const result = await check(schema, value, 'response');
	if (!result.ok) throw failure(settings.context, status, result.issues);
	return settings.decode ? result.value : value;
}

/** Waits `ms`, or less, when a signal aborts. */
export function pause(
	ms: number,
	...signals: (AbortSignal | undefined)[]
): Promise<void> {
	const live = signals.filter((each): each is AbortSignal => !!each);
	return new Promise((resolve) => {
		const done = () => {
			clearTimeout(timer);
			for (const each of live) each.removeEventListener('abort', done);
			resolve();
		};
		const timer = setTimeout(done, ms);
		for (const each of live) {
			if (each.aborted) return done();
			each.addEventListener('abort', done, { once: true });
		}
	});
}

/**
 * The reader of the connection a stream is on, and how it stops: `close()`
 * or the caller's abort cancels the read in progress, since an aborted
 * request does not always end its body.
 */
export class Reading {
	readonly closer = new AbortController();
	#reader: ReadableStreamDefaultReader<string> | undefined;
	readonly #signal: AbortSignal | undefined;
	readonly #halt = () => {
		this.#reader?.cancel().catch(() => {});
	};

	constructor(signal: AbortSignal | undefined) {
		this.#signal = signal;
		this.closer.signal.addEventListener('abort', this.#halt);
		signal?.addEventListener('abort', this.#halt);
	}

	/** Reads `response`'s body as text. */
	read(response: Response): ReadableStreamDefaultReader<string> {
		const body = response.body as ReadableStream<BufferSource>;
		this.#reader = body.pipeThrough(new TextDecoderStream()).getReader();
		return this.#reader;
	}

	/** Whether the stream was closed; the caller's abort throws its reason. */
	stopped(): boolean {
		this.#signal?.throwIfAborted();
		return this.closer.signal.aborted;
	}

	/** Lets the reader go, and stops listening to the caller's signal. */
	release(): void {
		this.#reader?.cancel().catch(() => {});
		this.#reader = undefined;
		this.#signal?.removeEventListener('abort', this.#halt);
	}

	close(): void {
		this.closer.abort();
	}
}
