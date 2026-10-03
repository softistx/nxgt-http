/** The replies of an `alxia.ts` route: a schema per status, or why alxia cannot send one. */
import type { MediaIR, SchemaNode } from '../../ir/types';
import { expr } from '../zod';
import { note, type Printing, preferred, scope } from './printing';

/** A stream alxia's `eventStream` sends: unnamed events, each its data as JSON. */
function eventData(media: MediaIR): SchemaNode | undefined {
	const [only, ...rest] = media.events ?? [];
	return only && rest.length === 0 && only.name === 'message'
		? only.data
		: undefined;
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
			(m.kind === 'sse' && eventData(m) !== undefined),
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
		const data = eventData(media);
		printing.eventStream = true;
		text = `eventStream(${data ? expr(ctx, data, at) : 'z.unknown()'})`;
	} else if (media.schema) {
		text = expr(ctx, media.schema, at);
	} else {
		text = media.kind === 'text' ? 'z.string()' : 'z.unknown()';
	}
	return { text: note(printing, text), media: media.mediaType, others };
}

function undeclarable(media: MediaIR | undefined): string {
	switch (media?.kind) {
		case 'jsonl':
			return `is JSON Lines (${media.mediaType}), which alxia does not stream yet`;
		case 'sse':
			return 'streams events alxia cannot send: its eventStream sends unnamed events, each its data as JSON';
		case 'form':
			return `is a form (${media.mediaType}): alxia replies with JSON or text`;
		default:
			return `is ${media?.mediaType ?? 'binary'}: binary replies are not declared yet`;
	}
}
