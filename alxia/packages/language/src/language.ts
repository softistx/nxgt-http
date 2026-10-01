import { alxia, type BaseContext, vary } from '@alxia/core';
import { match, negotiate } from './negotiate';

/** Where a language is read from. */
export type LanguageSource = 'query' | 'cookie' | 'path' | 'header';

export interface LanguageOptions<L extends string> {
	/** The languages the app speaks: the context's `language` is one of them. */
	readonly supported: readonly L[];
	/** The one it speaks when the request names none it does. */
	readonly fallback: NoInfer<L>;
	/** Where it looks, in order. `query`, `cookie`, then `header` by default. */
	readonly order?: readonly LanguageSource[];
	/** The query parameter: `?lang=fr`. `lang` by default. */
	readonly query?: string;
	/** The cookie. `language` by default. */
	readonly cookie?: string;
	/** The index of the path segment: `/fr/products` is 0. 0 by default. */
	readonly pathIndex?: number;
	/**
	 * Whether a language named by the query is kept in the cookie, so the
	 * next request speaks it too. Off by default.
	 */
	readonly persist?:
		| boolean
		| { readonly maxAge?: number; readonly secure?: boolean };
	/** Says `Content-Language` on every response. On by default. */
	readonly contentLanguage?: boolean;
	/** Decides itself, after every source: a user's saved preference. */
	readonly resolve?: (ctx: BaseContext) => string | undefined;
}

/** What the routes behind the plugin read. */
export interface LanguageContext<L extends string> {
	readonly language: L;
	/** Where it came from: `fallback` when nothing named one. */
	readonly languageSource: LanguageSource | 'resolve' | 'fallback';
}

/**
 * The request's language, as a plugin: the routes declared after it read
 * `language`, typed as one of `supported` — never a string a client made
 * up. It is read from the query, a cookie, a path segment and
 * `Accept-Language` — weights, `fr-CA` for `fr`, `fr` for `fr-FR` — in the
 * order given, then `fallback`.
 *
 * ```ts
 * app.use(language({ supported: ['en', 'fr'], fallback: 'en' }))
 *    .get('/', ({ language, reply }) => reply(200, language)); // 'en' | 'fr'
 * ```
 */
export function language<const L extends string>(options: LanguageOptions<L>) {
	const order = options.order ?? ['query', 'cookie', 'header'];
	const queryName = options.query ?? 'lang';
	const cookieName = options.cookie ?? 'language';
	const pathIndex = options.pathIndex ?? 0;
	const persist =
		options.persist === true
			? {}
			: options.persist === false
				? undefined
				: options.persist;
	const supported = options.supported;
	if (!supported.includes(options.fallback)) {
		throw new TypeError(
			`language(): the fallback "${options.fallback}" is not supported`,
		);
	}

	const read = (ctx: BaseContext, source: LanguageSource): L | undefined => {
		switch (source) {
			case 'query': {
				const value = ctx.url.searchParams.get(queryName);
				return value === null ? undefined : match(value, supported);
			}
			case 'cookie': {
				const value = new Bun.CookieMap(
					ctx.request.headers.get('cookie') ?? '',
				).get(cookieName);
				return value === null ? undefined : match(value, supported);
			}
			case 'path': {
				const segment = ctx.url.pathname.split('/').filter(Boolean)[pathIndex];
				return segment === undefined ? undefined : match(segment, supported);
			}
			case 'header':
				return negotiate(ctx.request.headers.get('accept-language'), supported);
		}
	};

	return alxia().derive((ctx): LanguageContext<L> => {
		let found: LanguageContext<L> | undefined;
		for (const source of order) {
			const value = read(ctx, source);
			if (value !== undefined) {
				found = { language: value, languageSource: source };
				break;
			}
		}
		if (found === undefined && options.resolve !== undefined) {
			const resolved = options.resolve(ctx);
			const value =
				resolved === undefined ? undefined : match(resolved, supported);
			if (value !== undefined)
				found = { language: value, languageSource: 'resolve' };
		}
		found ??= { language: options.fallback, languageSource: 'fallback' };

		if (order.includes('header')) vary(ctx.set.headers, 'Accept-Language');
		if (order.includes('cookie')) vary(ctx.set.headers, 'Cookie');
		if (options.contentLanguage !== false) {
			ctx.set.headers.set('content-language', found.language);
		}
		if (persist !== undefined && found.languageSource === 'query') {
			ctx.set.cookies.set(cookieName, found.language, {
				path: '/',
				sameSite: 'lax',
				httpOnly: false,
				secure: persist.secure ?? true,
				maxAge: persist.maxAge ?? 365 * 24 * 60 * 60,
			});
		}
		return found;
	});
}
