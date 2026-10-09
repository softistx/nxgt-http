/**
 * A `POST` marked `@queryMethod` made the `QUERY` it is, in an emitted
 * OpenAPI 3.2 document: its operation moves from `post` to `query` and loses
 * `x-nxgt-method`, which says nothing more there. A 3.1 document has no
 * `query` operation and keeps the `POST` and the mark. The text is written
 * again as `@typespec/openapi3` writes it, and left alone when nothing moves.
 */
import { parse, stringify } from 'yaml';

type PathItem = Record<string, unknown>;

/** Moves each marked `post` of a 3.2 document to `query`; whether any moved. */
function moveQueries(document: Record<string, unknown>): boolean {
	if (!String(document['openapi']).startsWith('3.2')) return false;
	const paths = document['paths'];
	if (typeof paths !== 'object' || paths === null) return false;
	let moved = false;
	for (const [path, item] of Object.entries(
		paths as Record<string, PathItem>,
	)) {
		const post = item['post'] as Record<string, unknown> | undefined;
		if (post?.['x-nxgt-method'] !== 'query' || item['query'] !== undefined) {
			continue;
		}
		const { 'x-nxgt-method': _, ...operation } = post;
		// In place of the `post`, so the path item keeps its order.
		(paths as Record<string, PathItem>)[path] = Object.fromEntries(
			Object.entries(item).map(([key, value]) =>
				key === 'post' ? ['query', operation] : [key, value],
			),
		);
		moved = true;
	}
	return moved;
}

/** The file's text with its queries moved, for a `.yaml`, `.yml` or `.json` document. */
export function withQueryOperations(path: string, content: string): string {
	if (path.endsWith('.json')) {
		const document = JSON.parse(content) as Record<string, unknown>;
		return moveQueries(document)
			? `${JSON.stringify(document, null, 2)}\n`
			: content;
	}
	if (!path.endsWith('.yaml') && !path.endsWith('.yml')) return content;
	const document = parse(content) as Record<string, unknown>;
	if (!moveQueries(document)) return content;
	// `@typespec/openapi3`'s own options, so the rest of the text is unchanged.
	return stringify(document, {
		singleQuote: true,
		aliasDuplicateObjects: false,
		lineWidth: 0,
		compat: 'yaml-1.1',
	});
}
