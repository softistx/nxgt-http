import { describe, expect, expectTypeOf, test } from 'bun:test';
import { alxia } from '@alxia/core';
import { language } from './language';
import { match, negotiate, parseAcceptLanguage } from './negotiate';

const app = alxia()
	.use(
		language({
			supported: ['en', 'fr', 'pt-BR'],
			fallback: 'en',
			persist: { secure: false },
		}),
	)
	.get('/', ({ language: current, languageSource, reply }) => {
		expectTypeOf(current).toEqualTypeOf<'en' | 'fr' | 'pt-BR'>();
		return reply(200, { language: current, source: languageSource });
	});

const get = async (path: string, headers: Record<string, string> = {}) => {
	const response = await app.request(path, { headers });
	return { body: await response.json(), response };
};

describe('language', () => {
	test('the query first, then the cookie, then Accept-Language, then the fallback', async () => {
		expect((await get('/?lang=fr', { cookie: 'language=pt-BR' })).body).toEqual(
			{ language: 'fr', source: 'query' },
		);
		expect(
			(await get('/', { cookie: 'language=pt-BR', 'accept-language': 'fr' }))
				.body,
		).toEqual({ language: 'pt-BR', source: 'cookie' });
		expect(
			(await get('/', { 'accept-language': 'de, fr-CA;q=0.8, en;q=0.5' })).body,
		).toEqual({ language: 'fr', source: 'header' });
		expect((await get('/', { 'accept-language': 'pt' })).body.language).toBe(
			'pt-BR',
		);
		expect((await get('/?lang=klingon')).body).toEqual({
			language: 'en',
			source: 'fallback',
		});
	});

	test('Content-Language and Vary on the response; a query language kept in the cookie', async () => {
		const { response } = await get('/?lang=fr');
		expect(response.headers.get('content-language')).toBe('fr');
		expect(response.headers.get('vary')).toBe('Accept-Language, Cookie');
		expect(response.headers.getSetCookie()[0]).toContain('language=fr');
	});

	test('a path segment, and a resolver', async () => {
		const byPath = alxia()
			.use(
				language({
					supported: ['en', 'fr'],
					fallback: 'en',
					order: ['path'],
					resolve: (ctx) => ctx.request.headers.get('x-saved') ?? undefined,
				}),
			)
			.get('/:lang/hello', ({ language: current, reply }) =>
				reply(200, current),
			);
		expect(await (await byPath.request('/fr/hello')).text()).toBe('fr');
		expect(
			await (
				await byPath.request('/de/hello', { headers: { 'x-saved': 'fr' } })
			).text(),
		).toBe('fr');
	});

	test('a fallback it does not support is refused', () => {
		// @ts-expect-error: 'de' is not one of the supported languages
		expect(() => language({ supported: ['en', 'fr'], fallback: 'de' })).toThrow(
			'not supported',
		);
	});
});

describe('negotiate', () => {
	test('weights, refusals, regions', () => {
		expect(parseAcceptLanguage('fr;q=0.5, en, de;q=0')).toEqual([
			{ tag: 'en', q: 1 },
			{ tag: 'fr', q: 0.5 },
		]);
		expect(negotiate('*', ['fr', 'en'])).toBe('fr');
		expect(match('EN-gb', ['en', 'fr'])).toBe('en');
		expect(negotiate('de', ['en'])).toBeUndefined();
	});
});
