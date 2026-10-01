import { AsyncLocalStorage } from 'node:async_hooks';
import { alxia } from '@alxia/core';
import { type LanguageOptions, language } from '@alxia/language';
import {
	createTranslator,
	type Path,
	registerLanguageSource,
	type TranslationContext,
} from '@nxgt/i18n';

/** Catalogues by language: `{ en: { greeting: 'Hello {name}' }, fr: … }`. */
export type Catalogues = Readonly<
	Record<string, Readonly<Record<string, unknown>>>
>;

/** Every key of a catalogue, dotted: `users.greeting`. */
export type KeyOf<Catalogue> = Path<Catalogue> & string;

/** A translation of a key, in a language, formatted with ICU's `context`. */
export type Translate<Key extends string> = (
	key: Key,
	context?: TranslationContext,
) => string;

export interface I18nOptions<
	C extends Catalogues,
	Fallback extends keyof C & string,
> extends Omit<LanguageOptions<keyof C & string>, 'supported' | 'fallback'> {
	/**
	 * The catalogues, one per language: their keys are the languages
	 * supported. Spread `@nxgt/i18n`'s `resources` into them for its shared
	 * keys — `errors.not-found`, `zod.*`.
	 */
	readonly resources: C;
	/** The language spoken when the request names none, and whose keys type `t`. */
	readonly fallback: Fallback;
}

/** What the routes behind the plugin read. */
export interface I18nContext<Key extends string> {
	/** Translates into the request's language. */
	readonly t: Translate<Key>;
}

/**
 * Translations, as a plugin, on [`@nxgt/i18n`](https://www.npmjs.com/package/@nxgt/i18n):
 * `@alxia/language` reads the request's language among the catalogues', and
 * the routes declared after it read `language` and `t`, bound to it. Keys
 * are typed by the fallback's catalogue; messages are ICU — plurals,
 * selects, numbers — and a missing key answers itself.
 *
 * The plugin's own `t()` translates anywhere a request runs — a service, an
 * error's message — in that request's language, and in the fallback outside.
 *
 * ```ts
 * const i18n = createI18n({ resources: { en, fr }, fallback: 'en' });
 * app.use(i18n).get('/', ({ t, reply }) => reply(200, t('home.title')));
 * ```
 *
 * The plugin registers the request's language as one of `@nxgt/i18n`'s
 * language sources, so its own `getLanguage()` and `translate` — and every
 * nxgt package that translates through them — speak it too.
 */
export function createI18n<
	const C extends Catalogues,
	const Fallback extends keyof C & string,
>(options: I18nOptions<C, Fallback>) {
	type Language = keyof C & string;
	type Key = KeyOf<C[Fallback]>;
	const { resources, fallback, ...detect } = options;
	const supported = Object.keys(resources) as Language[];
	const translator = createTranslator<Key>(
		resources as Record<string, unknown>,
	);
	const current = new AsyncLocalStorage<Language>();
	const translate =
		(lang: Language): Translate<Key> =>
		(key, context) =>
			translator(key, context, lang as never);

	// nxgt's own getLanguage() and translate speak the request's language too.
	registerLanguageSource(() => current.getStore());

	const plugin = alxia()
		.use(language<Language>({ ...detect, supported, fallback }))
		.wrap(({ language: lang }, next) => current.run(lang, next))
		.derive(({ language: lang }): I18nContext<Key> => ({ t: translate(lang) }));

	return Object.assign(plugin, {
		/** Translates into the current request's language, or the fallback outside one. */
		t: ((key, context) =>
			translate(current.getStore() ?? fallback)(
				key,
				context,
			)) as Translate<Key>,
		/** The current request's language, or the fallback outside one. */
		language: (): Language => current.getStore() ?? fallback,
		supported,
	});
}
