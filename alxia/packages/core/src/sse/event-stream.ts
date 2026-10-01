/**
 * Server-sent events, typed. A handler replies with an async iterable — an
 * `async function*` — and each value it yields is one event, sent as JSON.
 * The client reads the same values back as an async iterable.
 */
import {
	check,
	type InferInput,
	type InferOutput,
	type StandardSchemaV1,
} from '../schema/standard-schema';

/** A response schema whose body is a stream of events, each one checked by `item`. */
export interface EventStreamSchema<Item extends StandardSchemaV1>
	extends StandardSchemaV1<
		AsyncIterable<InferInput<Item>>,
		AsyncIterable<InferOutput<Item>>
	> {
	readonly '~eventStream': Item;
}

/**
 * The schema of a reply that streams events: each value the handler yields
 * is checked by `item`, and sent as its output.
 *
 * ```ts
 * app.get('/ticks', { response: { 200: eventStream(Tick) } }, ({ reply }) =>
 *   reply(200, (async function* () { yield { n: 1 }; })()));
 * ```
 */
export function eventStream<Item extends StandardSchemaV1>(
	item: Item,
): EventStreamSchema<Item> {
	return {
		'~eventStream': item,
		'~standard': {
			version: 1,
			vendor: 'alxia',
			validate: (value) => {
				if (!isAsyncIterable(value)) {
					return {
						issues: [
							{ message: 'An event stream replies with an async iterable' },
						],
					};
				}
				return { value: checkEach(item, value) };
			},
		},
	} as EventStreamSchema<Item>;
}

async function* checkEach(
	item: StandardSchemaV1,
	values: AsyncIterable<unknown>,
): AsyncGenerator<unknown> {
	for await (const value of values) {
		const checked = await check(item, value, 'body');
		if (!checked.ok) {
			throw new TypeError(
				`An event does not match its schema: ${checked.issues
					.map(
						(issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`,
					)
					.join('; ')}`,
			);
		}
		yield checked.value;
	}
}

export function isAsyncIterable(
	value: unknown,
): value is AsyncIterable<unknown> {
	return (
		value !== null &&
		typeof value === 'object' &&
		Symbol.asyncIterator in value &&
		!(value instanceof ReadableStream)
	);
}

export function isEventStreamSchema(
	schema: StandardSchemaV1,
): schema is EventStreamSchema<StandardSchemaV1> {
	return '~eventStream' in schema;
}

/** How often a comment keeps an idle stream open: Bun closes a silent one. */
export const KEEP_ALIVE_MS = 8_000;

/**
 * The events of `values` as a `text/event-stream` body: each value as one
 * `data:` line of JSON, a comment while nothing is sent, and the iterator
 * closed when the client goes away.
 */
export function toEventStream(
	values: AsyncIterable<unknown>,
	signal?: AbortSignal,
): ReadableStream<Uint8Array> {
	const encoder = new TextEncoder();
	const iterator = values[Symbol.asyncIterator]();
	let timer: ReturnType<typeof setInterval> | undefined;
	const stop = () => {
		if (timer !== undefined) clearInterval(timer);
		timer = undefined;
	};
	return new ReadableStream<Uint8Array>({
		start(controller) {
			timer = setInterval(() => {
				try {
					controller.enqueue(encoder.encode(': keep-alive\n\n'));
				} catch {
					stop();
				}
			}, KEEP_ALIVE_MS);
			signal?.addEventListener('abort', () => {
				stop();
				void iterator.return?.();
			});
		},
		async pull(controller) {
			try {
				const next = await iterator.next();
				if (next.done) {
					stop();
					controller.close();
					return;
				}
				const data = JSON.stringify(next.value) ?? 'null';
				controller.enqueue(
					encoder.encode(
						`${data
							.split('\n')
							.map((line) => `data: ${line}`)
							.join('\n')}\n\n`,
					),
				);
			} catch (error) {
				stop();
				console.error(error);
				controller.error(error);
			}
		},
		cancel() {
			stop();
			void iterator.return?.();
		},
	});
}
