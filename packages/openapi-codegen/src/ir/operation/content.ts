import { child, type Location } from '../../loader/location';
import { isObject } from '../../util';
import type { MediaIR, SchemaNode } from '../types';
import { events } from './events';
import { mediaKind, sequentialKind } from './media';
import type { OperationState } from './state';

/** A reply's `content`, where a stream is read an item at a time; a body's is sent whole. */
export function content(
	state: Pick<OperationState, 'diagnostics' | 'resolver' | 'schemas'>,
	raw: unknown,
	at: Location,
	stem: string,
	reply = false,
): MediaIR[] {
	const media: MediaIR[] = [];
	if (raw === undefined) return media;
	if (!isObject(raw)) {
		state.diagnostics.error(
			'invalid_operation',
			'`content` must be an object',
			at,
		);
		return media;
	}
	let structured = 0;
	for (const [mediaType, value] of Object.entries(raw)) {
		const entry = state.resolver.deref(value, child(at, mediaType));
		const object = isObject(entry.value) ? entry.value : {};
		const schemaAt = child(entry.location, 'schema');
		const itemAt = child(entry.location, 'itemSchema');
		const sequential = reply ? sequentialKind(mediaType) : undefined;
		if (sequential === 'sse') {
			const declared = events(state, object['itemSchema'], itemAt, stem);
			media.push({
				mediaType,
				kind: 'sse',
				...(declared && { events: declared }),
			});
			continue;
		}
		if (sequential === 'jsonl') {
			const item =
				object['itemSchema'] === undefined
					? undefined
					: state.schemas.inline(object['itemSchema'], itemAt, `${stem}Item`);
			media.push({ mediaType, kind: 'jsonl', ...(item && { item }) });
			continue;
		}
		const kind = mediaKind(mediaType);
		let schema: SchemaNode | undefined;
		if (kind === 'json' || kind === 'form') {
			structured++;
			schema = state.schemas.inline(
				object['schema'],
				schemaAt,
				structured === 1 ? stem : `${stem}${structured}`,
			);
		} else if (kind === 'text') {
			schema =
				object['schema'] === undefined
					? { kind: 'string' }
					: state.schemas.node(object['schema'], schemaAt);
		}
		media.push({ mediaType, kind, schema });
	}
	return media;
}
