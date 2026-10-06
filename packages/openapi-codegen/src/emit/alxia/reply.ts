/** The replies of an `alxia.ts` route: a schema per status, or why alxia cannot send one. */
import type { MediaIR, SchemaNode } from '../../ir/types';
import { propertyKey } from '../printer';
import { expr } from '../zod';
import { note, type Printing, preferred, scope } from './printing';

/** A line break or a NUL, which alxia refuses in an event name. */
const BREAK = /[\r\n\0]/;

/**
 * The events of a stream as alxia's `eventStream` sends them, or why it
 * cannot: their data is always JSON. One unnamed event, a `message`, is
 * `eventStream(schema)`; otherwise `eventStream({ name: schema, … })`, each
 * sent with its `event:` line.
 */
function streamOf(media: MediaIR):
	| { named: false; data: SchemaNode; skip?: undefined }
	| {
			named: true;
			events: { name: string; data: SchemaNode }[];
			skip?: undefined;
	  }
	| { skip: string } {
	const events = media.events ?? [];
	if (events.length === 0) {
		return {
			skip: 'streams events it does not declare: alxia sends each event from a schema, its data as JSON',
		};
	}
	const declared: { name: string; data: SchemaNode }[] = [];
	for (const { name, data } of events) {
		if (data === undefined) {
			return {
				skip: `streams the event \`${name}\` with text data: alxia's eventStream sends each event's data as JSON`,
			};
		}
		if (name === '' || BREAK.test(name)) {
			return {
				skip: `streams an event named ${JSON.stringify(name)}, which alxia's eventStream refuses`,
			};
		}
		declared.push({ name, data });
	}
	const [only] = declared;
	return only && declared.length === 1 && only.name === 'message'
		? { named: false, data: only.data }
		: { named: true, events: declared };
}

/** One reply's schema, or why alxia cannot declare it. */
export function replySchema(
	printing: Printing,
	content: readonly MediaIR[],
):
	| { text: string; media: string; others: string[]; skip?: undefined }
	| { skip: string } {
	const { ctx } = printing;
	if (content.length === 0) {
		return { text: note(printing, 'z.undefined()'), media: '', others: [] };
	}
	const declarable = content.filter(
		(m) =>
			m.kind === 'json' ||
			m.kind === 'text' ||
			(m.kind === 'sse' && streamOf(m).skip === undefined),
	);
	const media = preferred(declarable);
	if (!media) {
		const [first] = content;
		return { skip: undeclarable(first) };
	}
	const others = content.filter((m) => m !== media).map((m) => m.mediaType);
	const at = scope(printing, '\t\t\t');
	let text: string;
	if (media.kind === 'sse') {
		printing.eventStream = true;
		text = eventStream(printing, streamOf(media));
	} else if (media.schema) {
		text = expr(ctx, media.schema, at);
	} else {
		text = media.kind === 'text' ? 'z.string()' : 'z.unknown()';
	}
	return { text: note(printing, text), media: media.mediaType, others };
}

/** `eventStream(zItem)`, or `eventStream({ tick: zTick, … })`. */
function eventStream(
	printing: Printing,
	stream: ReturnType<typeof streamOf>,
): string {
	const { ctx } = printing;
	if (stream.skip !== undefined) throw new Error(stream.skip);
	if (!stream.named) {
		return `eventStream(${expr(ctx, stream.data, scope(printing, '\t\t\t'))})`;
	}
	const entries = stream.events.map(
		({ name, data }) =>
			`\t\t\t\t${propertyKey(name)}: ${expr(ctx, data, scope(printing, '\t\t\t\t'))},`,
	);
	return `eventStream({\n${entries.join('\n')}\n\t\t\t})`;
}

function undeclarable(media: MediaIR | undefined): string {
	switch (media?.kind) {
		case 'jsonl':
			return `is JSON Lines (${media.mediaType}), which alxia does not stream yet`;
		case 'sse':
			return streamOf(media).skip ?? 'streams events alxia cannot send';
		case 'form':
			return `is a form (${media.mediaType}): alxia replies with JSON or text`;
		default:
			return `is ${media?.mediaType ?? 'binary'}: binary replies are not declared yet`;
	}
}
