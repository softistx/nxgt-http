/**
 * A stream's items, as a client reads them and a handler writes them: an
 * event union narrowed on `event`, or a JSON line, decoded or as JSON
 * carries it.
 */
import type {
	ClientOperations,
	ImportItems200ResponseItem,
	Item,
	Operations,
	WatchFeed200ResponseRemovedData,
	Wire,
} from '../generated/streams/types.js';

type Equal<X, Y> = [X] extends [Y] ? ([Y] extends [X] ? true : false) : false;
type Assert<T extends true> = T;

type Stream<K extends keyof ClientOperations> = ClientOperations[K] extends {
	stream: infer S;
}
	? S
	: never;
type Event<K extends keyof ClientOperations, Name> = Extract<
	Stream<K> extends { item: infer I } ? I : never,
	{ event: Name }
>;

export type Checks = [
	Assert<Equal<Stream<'watchFeed'>['kind'], 'sse'>>,
	Assert<Equal<Event<'watchFeed', 'update'>['data'], Item>>,
	Assert<
		Equal<
			Event<'watchFeed', 'removed'>['data'],
			WatchFeed200ResponseRemovedData
		>
	>,
	// Data sent without `contentMediaType: application/json` is text.
	Assert<Equal<Event<'watchFeed', 'ping'>['data'], string>>,
	Assert<Equal<Event<'watchFeed', 'ping'>['id'], string | undefined>>,
	// As JSON carries it, a date-time is its ISO string.
	Assert<
		Equal<
			Extract<Stream<'watchFeed'>['wire'], { event: 'update' }>['data'],
			Wire<Item>
		>
	>,
	Assert<Equal<Item['updatedAt'], Date | undefined>>,
	// An event sent without a name is a `message`.
	Assert<Equal<Stream<'listenMessages'>['item']['event'], 'message'>>,
	// No `itemSchema`: any event, its data as text.
	Assert<
		Equal<
			Stream<'tailLogs'>['item'],
			{ event: string; data: string; id: string | undefined }
		>
	>,
	Assert<Equal<Stream<'exportItems'>['kind'], 'jsonl'>>,
	Assert<Equal<Stream<'exportItems'>['item'], Item>>,
	Assert<Equal<Stream<'importItems'>['item'], ImportItems200ResponseItem>>,
	// The reply read whole is still declared.
	Assert<
		Equal<
			Extract<ClientOperations['watchFeed']['reply'], { status: 200 }>['data'],
			string
		>
	>,
	// A handler writes an event, with an `id` and a `retry` if it likes.
	Assert<
		Equal<
			Extract<Operations['watchFeed']['stream']['item'], { event: 'update' }>,
			{ event: 'update'; data: Item; id?: string; retry?: number }
		>
	>,
];
