/** Media types: a `Content-Type` header against the ones an operation declares. */
import type { RuntimeMedia } from '../engine';

/** The media type of a `Content-Type` header, without its parameters, lowercased. */
export const mediaType = (header: string): string =>
	(header.split(';')[0] ?? '').trim().toLowerCase();

/** The declared media type for `type`: itself, else `type/*`, else `*\/*`. */
export function match(
	content: { readonly [mediaType: string]: RuntimeMedia },
	type: string,
): RuntimeMedia | undefined {
	for (const [key, media] of Object.entries(content)) {
		if (key.toLowerCase() === type) return media;
	}
	return content[`${type.split('/')[0]}/*`] ?? content['*/*'];
}
