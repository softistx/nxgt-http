/** Media types: what a reply is read as, and which declared one it stands for. */

export type MediaKind = 'json' | 'form' | 'text' | 'binary';

/** `application/json` from `application/json; charset=utf-8`. */
export const mediaType = (header: string): string =>
	(header.split(';')[0] ?? '').trim().toLowerCase();

/** How a media type is read, as `@nxgt/openapi-codegen` classifies it. */
export function mediaKind(type: string): MediaKind {
	if (
		type === 'application/json' ||
		/^application\/[\w.-]+\+json$/.test(type)
	) {
		return 'json';
	}
	if (
		type === 'application/x-www-form-urlencoded' ||
		type === 'multipart/form-data'
	) {
		return 'form';
	}
	return type.startsWith('text/') ? 'text' : 'binary';
}

/**
 * The declared media type a reply of `type` stands for: itself, then
 * `type/*`, then `*\/*`, then the first JSON or text one of its own kind,
 * since what `c.json()` sends, `application/json`, stands for a declared
 * `application/problem+json`.
 */
export function declaredType(
	content: { readonly [mediaType: string]: { readonly kind: MediaKind } },
	type: string,
): string | undefined {
	const types = Object.keys(content);
	const exact = types.find((key) => key.toLowerCase() === type);
	if (exact !== undefined) return exact;
	const range = `${type.split('/')[0]}/*`;
	if (content[range]) return range;
	if (content['*/*']) return '*/*';
	const kind = mediaKind(type);
	if (kind !== 'json' && kind !== 'text') return undefined;
	return types.find((key) => content[key]?.kind === kind);
}
