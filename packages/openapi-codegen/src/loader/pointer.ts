/**
 * JSON Pointer (RFC 6901). Pointers are kept in their escaped string form
 * (`/paths/~1employees~1{id}`), never percent-encoded — decoding a `$ref`
 * fragment happens once, where the `$ref` is read.
 */

export const escapeToken = (token: string): string =>
	token.replaceAll('~', '~0').replaceAll('/', '~1');

// `~1` before `~0`, or `~01` would decode to `/` instead of `~1`.
export const unescapeToken = (token: string): string =>
	token.replaceAll('~1', '/').replaceAll('~0', '~');

/** The tokens of a pointer, or `undefined` if it is not one. */
export function parsePointer(pointer: string): string[] | undefined {
	if (pointer === '') return [];
	if (!pointer.startsWith('/')) return undefined;
	return pointer.slice(1).split('/').map(unescapeToken);
}

export const formatPointer = (tokens: readonly (string | number)[]): string =>
	tokens.map((token) => `/${escapeToken(String(token))}`).join('');

export const appendPointer = (
	pointer: string,
	...tokens: readonly (string | number)[]
): string => pointer + formatPointer(tokens);

export type Lookup = { found: true; value: unknown } | { found: false };

export function lookup(document: unknown, pointer: string): Lookup {
	const tokens = parsePointer(pointer);
	if (!tokens) return { found: false };
	let node = document;
	for (const token of tokens) {
		if (Array.isArray(node)) {
			if (!/^(0|[1-9]\d*)$/.test(token)) return { found: false };
			const index = Number(token);
			if (index >= node.length) return { found: false };
			node = node[index];
		} else if (
			node !== null &&
			typeof node === 'object' &&
			Object.hasOwn(node, token)
		) {
			node = (node as Record<string, unknown>)[token];
		} else {
			return { found: false };
		}
	}
	return { found: true, value: node };
}
