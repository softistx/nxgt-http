/** What the keys and calls of both entry points share. */

/** Both signals: the call ends on either. */
export const joined = (
	given: AbortSignal | null | undefined,
	query: AbortSignal,
): AbortSignal => (given ? AbortSignal.any([given, query]) : query);

/** A value TanStack hashes as it is: a `URLSearchParams` or `FormData` as its entries. */
const hashable = (value: unknown): unknown =>
	value instanceof URLSearchParams ||
	(typeof FormData !== 'undefined' && value instanceof FormData)
		? [...value.entries()]
		: value;

/** The parts of an input that tell two calls to one path apart. */
const PARTS = [
	'param',
	'query',
	'header',
	'json',
	'form',
	'text',
	'body',
] as const;

/** What tells two calls to one path apart: what they send, and `decode: false`. */
function keyed(input: object | undefined): object | undefined {
	if (!input) return undefined;
	const given = input as { readonly [part: string]: unknown };
	const key: Record<string, unknown> = {};
	for (const part of PARTS) {
		if (given[part] !== undefined) key[part] = hashable(given[part]);
	}
	if (given.decode === false) key.decode = false;
	return Object.keys(key).length > 0 ? key : undefined;
}

/** A key, or the start of one: `[scope?, method, path?, input?]`. */
export function keyOf(
	scope: string | undefined,
	method: string,
	path?: string,
	input?: object,
): unknown[] {
	const key: unknown[] = scope === undefined ? [method] : [scope, method];
	if (path !== undefined) key.push(path);
	const rest = keyed(input);
	if (rest !== undefined) key.push(rest);
	return key;
}

/** `input` with `pageParam` as its query parameter `name`: left out when `null`. */
export function paged<Input extends { readonly query?: unknown }>(
	input: Input | undefined,
	name: string,
	pageParam: unknown,
): Input {
	const given = input?.query;
	if (given instanceof URLSearchParams) {
		const query = new URLSearchParams(given);
		if (pageParam === null || pageParam === undefined) query.delete(name);
		else query.set(name, String(pageParam));
		return { ...input, query } as Input;
	}
	return {
		...input,
		query: { ...(given as object | undefined), [name]: pageParam },
	} as Input;
}
