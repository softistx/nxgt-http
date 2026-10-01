import { describe, expect, expectTypeOf, test } from 'bun:test';
import { alxia } from '@alxia/core';
import { getLanguage, resources as shared } from '@nxgt/i18n';
import { createI18n } from './i18n';

const en = {
	...shared.en,
	home: {
		title: 'Welcome',
		items: '{count, plural, =0 {No items} one {One item} other {# items}}',
	},
} as const;
const fr = {
	...shared.fr,
	home: {
		title: 'Bienvenue',
		items:
			'{count, plural, =0 {Aucun article} one {Un article} other {# articles}}',
	},
} as const;

const i18n = createI18n({ resources: { en, fr }, fallback: 'en' });

/** A service, deep down: no language passed. */
async function describeCart(count: number) {
	await Bun.sleep(1);
	return i18n.t('home.items', { count });
}

const app = alxia()
	.use(i18n)
	.get('/', async ({ t, language, reply }) => {
		expectTypeOf(language).toEqualTypeOf<'en' | 'fr'>();
		return reply(200, {
			title: t('home.title'),
			cart: await describeCart(3),
			error: t('errors.not-found'),
		});
	});

describe('i18n', () => {
	test("t speaks the request's language, ICU and the shared keys included", async () => {
		const fr_ = await (
			await app.request('/', { headers: { 'accept-language': 'fr-FR' } })
		).json();
		expect(fr_.title).toBe('Bienvenue');
		expect(fr_.cart).toBe('3 articles');
		expect(fr_.error).not.toBe('errors.not-found');
		const en_ = await (await app.request('/?lang=en')).json();
		expect(en_).toMatchObject({ title: 'Welcome', cart: '3 items' });
	});

	test('concurrent requests keep their own language', async () => {
		const languages = Array.from({ length: 10 }, (_, index) =>
			index % 2 ? 'fr' : 'en',
		);
		const titles = await Promise.all(
			languages.map(
				async (lang) =>
					(await (await app.request(`/?lang=${lang}`)).json()).title,
			),
		);
		expect(titles).toEqual(
			languages.map((lang) => (lang === 'fr' ? 'Bienvenue' : 'Welcome')),
		);
	});

	test('outside a request: the fallback; keys are typed', () => {
		expect(i18n.t('home.title')).toBe('Welcome');
		expect(i18n.language()).toBe('en');
		// @ts-expect-error: not a key of the catalogue
		expect(i18n.t('home.nope')).toBe('home.nope');
	});
});

describe("@nxgt/i18n's own getLanguage", () => {
	test("speaks the alxia request's language", async () => {
		const spoken = alxia()
			.use(i18n)
			.get('/nxgt', async ({ reply }) => {
				await Bun.sleep(1);
				return reply(200, getLanguage());
			});
		expect(await (await spoken.request('/nxgt?lang=fr')).text()).toBe('fr');
		expect(getLanguage()).toBe('en');
	});
});
