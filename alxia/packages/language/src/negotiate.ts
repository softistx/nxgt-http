/** One language a client accepts, with its weight. */
export interface Accepted {
	readonly tag: string;
	readonly q: number;
}

/** `Accept-Language` as its languages, the most wanted first; a weight of 0 refused. */
export function parseAcceptLanguage(
	header: string | null | undefined,
): Accepted[] {
	if (!header) return [];
	return header
		.split(',')
		.map((part, index) => {
			const [tag = '', ...params] = part.trim().split(';');
			const q = params
				.map((param) => param.trim())
				.find((param) => param.startsWith('q='));
			const weight = q === undefined ? 1 : Number(q.slice(2));
			return {
				tag: tag.trim(),
				q: Number.isFinite(weight) ? weight : 0,
				index,
			};
		})
		.filter((entry) => entry.tag !== '' && entry.q > 0)
		.sort((a, b) => b.q - a.q || a.index - b.index)
		.map(({ tag, q }) => ({ tag, q }));
}

/**
 * The supported language a tag names: itself, whatever its case; its base
 * language — `fr-CA` to `fr`; or a region of it — `fr` to `fr-FR`.
 * `undefined` when none.
 */
export function match<const L extends string>(
	tag: string,
	supported: readonly L[],
): L | undefined {
	const wanted = tag.toLowerCase();
	if (wanted === '*') return supported[0];
	const exact = supported.find((language) => language.toLowerCase() === wanted);
	if (exact !== undefined) return exact;
	const base = wanted.split('-')[0] ?? wanted;
	return (
		supported.find((language) => language.toLowerCase() === base) ??
		supported.find((language) => language.toLowerCase().split('-')[0] === base)
	);
}

/** The supported language `Accept-Language` prefers, or `undefined`. */
export function negotiate<const L extends string>(
	header: string | null | undefined,
	supported: readonly L[],
): L | undefined {
	for (const { tag } of parseAcceptLanguage(header)) {
		const found = match(tag, supported);
		if (found !== undefined) return found;
	}
	return undefined;
}
