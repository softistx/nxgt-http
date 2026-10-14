/**
 * The two directions a view can face. A view leaves out what the other side
 * owns: what a client sends has no `readOnly` property (the server sets it),
 * what a server replies has no `writeOnly` one (the client sets it). Each
 * direction says which media are its roots, which mark it drops, and how its
 * copies are named; the rest of the pass is the same for both.
 */
import { refsOf } from '../graph';
import type { ApiIR, MediaIR, OperationIR, SchemaNode } from '../types';

export interface Direction {
	/** The mark whose properties the view leaves out. */
	mark: 'readOnly' | 'writeOnly';
	/** Ends the name of a copy: `PetWrite`, `UserRead`. */
	suffix: 'Write' | 'Read';
	/** Ends the id of a copy: `<id>#write`, `<id>#read`. */
	tag: 'write' | 'read';
	/** What the roots are, for messages. */
	root: 'request body' | 'response';
	/** Who reads the view, for messages. */
	reader: 'a client sends' | 'a server sends';
	/** The media the view faces: bodies for writing, replies for reading. */
	media(operation: OperationIR): MediaIR[];
	/** The media of the other direction, which see schemas as they are. */
	opposite(operation: OperationIR): MediaIR[];
	/** The operation with each of its media mapped; itself when none changed. */
	mapMedia(
		operation: OperationIR,
		fn: (media: MediaIR) => MediaIR,
	): OperationIR;
}

const bodyMedia = (operation: OperationIR): MediaIR[] =>
	operation.body?.content ?? [];
const replyMedia = (operation: OperationIR): MediaIR[] =>
	operation.responses.flatMap((r) => r.content);

export const WRITE: Direction = {
	mark: 'readOnly',
	suffix: 'Write',
	tag: 'write',
	root: 'request body',
	reader: 'a client sends',
	media: bodyMedia,
	opposite: replyMedia,
	mapMedia(operation, fn) {
		const { body } = operation;
		if (!body) return operation;
		const content = body.content.map(fn);
		return content.some((m, i) => m !== body.content[i])
			? { ...operation, body: { ...body, content } }
			: operation;
	},
};

export const READ: Direction = {
	mark: 'writeOnly',
	suffix: 'Read',
	tag: 'read',
	root: 'response',
	reader: 'a server sends',
	media: replyMedia,
	opposite: bodyMedia,
	mapMedia(operation, fn) {
		const responses = operation.responses.map((r) => {
			const content = r.content.map(fn);
			return content.some((m, i) => m !== r.content[i]) ? { ...r, content } : r;
		});
		return responses.some((r, i) => r !== operation.responses[i])
			? { ...operation, responses }
			: operation;
	},
};

/** The schemas a media type validates: its schema, a stream's items and events. */
export function mediaNodes(media: MediaIR): SchemaNode[] {
	return [
		...(media.schema ? [media.schema] : []),
		...(media.item ? [media.item] : []),
		...(media.events ?? []).flatMap((e) => (e.data ? [e.data] : [])),
	];
}

/** The ids a media type's schemas point at. */
export const mediaRefs = (media: MediaIR): string[] =>
	mediaNodes(media).flatMap((node) => refsOf(node));

/** The media type with each of its schemas mapped; itself when none changed. */
export function mapNodes(
	media: MediaIR,
	fn: (node: SchemaNode) => SchemaNode,
): MediaIR {
	const schema = media.schema && fn(media.schema);
	const item = media.item && fn(media.item);
	const events = media.events?.map((e) =>
		e.data ? { ...e, data: fn(e.data) } : e,
	);
	const same =
		schema === media.schema &&
		item === media.item &&
		(events ?? []).every((e, i) => e === media.events?.[i]);
	if (same) return media;
	return {
		...media,
		...(schema ? { schema } : {}),
		...(item ? { item } : {}),
		...(events ? { events } : {}),
	};
}

/** A root: a schema the view's media validate, and the operation it is in. */
export interface Root {
	operation: OperationIR;
	node: SchemaNode;
}

export const rootsOf = (api: ApiIR, direction: Direction): Root[] =>
	api.operations.flatMap((operation) =>
		direction
			.media(operation)
			.flatMap((media) =>
				mediaNodes(media).map((node) => ({ operation, node })),
			),
	);
