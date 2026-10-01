/**
 * A `text/event-stream` body as the values its events carry: each event's
 * `data`, parsed as JSON. Comments — the server's keep-alives — are skipped.
 */
export async function* readEvents(
	body: ReadableStream<Uint8Array>,
): AsyncGenerator<unknown> {
	const decoder = new TextDecoder();
	let buffer = '';
	for await (const chunk of body) {
		buffer += decoder.decode(chunk, { stream: true }).replace(/\r\n?/g, '\n');
		let end = buffer.indexOf('\n\n');
		while (end !== -1) {
			const event = buffer.slice(0, end);
			buffer = buffer.slice(end + 2);
			const data = dataOf(event);
			if (data !== undefined) yield JSON.parse(data);
			end = buffer.indexOf('\n\n');
		}
	}
	const data = dataOf(buffer);
	if (data !== undefined) yield JSON.parse(data);
}

function dataOf(event: string): string | undefined {
	const lines = event
		.split('\n')
		.filter((line) => line.startsWith('data:'))
		.map((line) => line.slice(line.startsWith('data: ') ? 6 : 5));
	return lines.length === 0 ? undefined : lines.join('\n');
}
