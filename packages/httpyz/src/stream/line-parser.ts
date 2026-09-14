/**
 * JSON Lines, NDJSON and JSON text sequences, split into their records: one
 * JSON text a line, or after each record separator (`\x1E`). Blank lines
 * separate nothing, and a last record needs no line end.
 */

export interface LineParser {
	/** Reads a chunk of text, and returns the records it completed. */
	push(chunk: string): string[];
	/** The record left when the stream ends, if any. */
	end(): string[];
}

/** A JSON text sequence's record separator, which ends a record as a line end does. */
const RS = String.fromCharCode(0x1e);

export function createLineParser(): LineParser {
	let buffer = '';
	const records = (texts: string[]) =>
		texts.map((text) => text.trim()).filter((text) => text !== '');
	return {
		push(chunk) {
			const parts = (buffer + chunk).replaceAll(RS, '\n').split(/\r?\n/);
			buffer = parts.pop() ?? '';
			return records(parts);
		},
		end() {
			const rest = buffer;
			buffer = '';
			return records([rest]);
		},
	};
}
