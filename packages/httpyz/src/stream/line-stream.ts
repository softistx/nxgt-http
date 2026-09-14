/** `http.lines()`: JSON Lines, NDJSON or JSON text sequences, a record at a time. */
import { NetworkError } from '../errors/errors';
import type { StandardSchemaV1 } from '../schema/standard-schema';
import { opened, Reading, type StreamSettings, settle } from './connection';
import { createLineParser } from './line-parser';
import type { Stream } from './types';

/** The media types a stream of lines is served as. */
export const LINE_TYPES = [
	'application/jsonl',
	'application/x-ndjson',
	'application/ndjson',
	'application/jsonlines',
	'application/x-jsonlines',
	'application/json-seq',
] as const;

export interface LineSettings extends StreamSettings {
	readonly item: StandardSchemaV1 | undefined;
}

export function lineStream(settings: LineSettings): Stream<unknown> {
	const reading = new Reading(settings.signal);
	let started = false;

	async function* run(): AsyncGenerator<unknown, void, undefined> {
		try {
			let response: Response;
			try {
				response = await settings.open(reading.closer.signal, undefined);
			} catch (error) {
				if (reading.closer.signal.aborted) return;
				throw error;
			}
			if (!(await opened(settings, response, LINE_TYPES))) return;
			const parser = createLineParser();
			const reader = reading.read(response);
			for (;;) {
				let chunk: Awaited<ReturnType<typeof reader.read>>;
				try {
					chunk = await reader.read();
				} catch (error) {
					if (reading.stopped()) return;
					throw new NetworkError(settings.context, { cause: error });
				}
				if (reading.stopped()) return;
				const texts = chunk.done ? parser.end() : parser.push(chunk.value);
				for (const text of texts) {
					yield await settle(
						settings,
						response.status,
						text,
						settings.item,
						'a line',
					);
				}
				if (chunk.done) return;
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
	};
}
