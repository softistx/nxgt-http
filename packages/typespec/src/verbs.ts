/**
 * The verbs `@operationIds` completes with an interface's resource: `create`
 * in `Users` is `createUser`, `list` is `listUsers`, and `findById` is
 * `findUserById`. Any other name is the id as written.
 */

/** Whether a verb takes the resource's singular or its plural. */
export type Grammar = 'singular' | 'plural';

/** A resource's two names: `User` and `Users`. */
export interface Resource {
	readonly singular: string;
	readonly plural: string;
}

/** The library's own verbs. */
export const VERBS: Readonly<Record<string, Grammar>> = {
	list: 'plural',
	read: 'plural',
	find: 'plural',
	search: 'plural',
	count: 'plural',
	createMany: 'plural',
	updateMany: 'plural',
	deleteMany: 'plural',
	get: 'singular',
	create: 'singular',
	update: 'singular',
	patch: 'singular',
	replace: 'singular',
	upsert: 'singular',
	delete: 'singular',
};

/** Plurals the rules below get wrong, by their singular. */
const IRREGULAR: Readonly<Record<string, string>> = {
	people: 'person',
	children: 'child',
	men: 'man',
	women: 'woman',
	mice: 'mouse',
	feet: 'foot',
	teeth: 'tooth',
	geese: 'goose',
	movies: 'movie',
	cookies: 'cookie',
	series: 'series',
	species: 'species',
	news: 'news',
};

/** `-es` plurals of a singular in `-us`: `Statuses`, not `Houses`. */
const US_ES = /(stat|bon|camp|vir|b|foc|cens|corp|radi|syllab)uses$/i;

/** `-es` plurals of a singular in a sibilant: `Boxes`, `Matches`, `Wishes`. */
const SIBILANT_ES = /(ss|x|zz|sh|tch|nch|rch|oach)es$/i;

/**
 * The singular of a plural name, by a short English rule on its last word:
 * `Users`, `BlogPosts`, `Categories`, `Addresses`, `Statuses`, `People`. A
 * guess: it misses some (`Heroes`, `Analysis`), which `singular` names.
 */
export function singularOf(plural: string): string {
	const word = /[A-Z]?[a-z0-9]*$/.exec(plural)?.[0] ?? '';
	const head = plural.slice(0, plural.length - word.length);
	const key = word.toLowerCase();
	const irregular = Object.hasOwn(IRREGULAR, key) ? IRREGULAR[key] : undefined;
	if (irregular !== undefined) {
		const cased = word[0] === word[0]?.toUpperCase();
		return `${head}${cased ? irregular[0]?.toUpperCase() + irregular.slice(1) : irregular}`;
	}
	if (/ies$/.test(word) && word.length > 4)
		return `${head}${word.slice(0, -3)}y`;
	if (US_ES.test(word) || SIBILANT_ES.test(word)) {
		return `${head}${word.slice(0, -2)}`;
	}
	if (/[^su]s$/.test(word)) return `${head}${word.slice(0, -1)}`;
	return plural;
}

/**
 * The id of an operation of a resource: the verb and the resource's singular
 * or plural, or the verb, the resource and the rest of a `By` name:
 * `findById` to `findUserById`, the singular, but `deleteManyByTeam` to
 * `deleteManyUsersByTeam`, the plural of a `*Many` verb. `undefined` when
 * the name is none of them. The resource is taken only then.
 */
export function idWithVerb(
	name: string,
	resource: () => Resource,
	verbs: Readonly<Record<string, Grammar>>,
): string | undefined {
	if (Object.hasOwn(verbs, name)) {
		return `${name}${resource()[verbs[name] as Grammar]}`;
	}
	for (const by of name.matchAll(/By[A-Z]/g)) {
		const verb = name.slice(0, by.index);
		if (verb === '' || !Object.hasOwn(verbs, verb)) continue;
		const names = resource();
		const noun = verb.endsWith('Many') ? names.plural : names.singular;
		return `${verb}${noun}${name.slice(by.index)}`;
	}
	return undefined;
}
