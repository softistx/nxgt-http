# @alxia/i18n

Translations for [alxia](https://www.npmjs.com/package/@alxia/core), on
[`@nxgt/i18n`](https://www.npmjs.com/package/@nxgt/i18n): `t()` bound to the
request's language, keys typed by your catalogue, ICU messages — plurals,
selects, numbers.

```sh
bun add @alxia/i18n @alxia/language @nxgt/i18n@^2
```

## Usage

```ts
import { createI18n } from '@alxia/i18n';
import { resources as shared } from '@nxgt/i18n';

const en = { ...shared.en, cart: { items: '{count, plural, =0 {No items} one {One item} other {# items}}' } };
const fr = { ...shared.fr, cart: { items: '{count, plural, =0 {Aucun article} one {Un article} other {# articles}}' } };

export const i18n = createI18n({ resources: { en, fr }, fallback: 'en' });

const app = alxia()
	.use(i18n)
	.get('/cart', ({ t, language, reply }) => reply(200, t('cart.items', { count: 3 }))); // '3 articles'
```

- **The language** is `@alxia/language`'s, among the catalogues' languages:
  the query, a cookie, `Accept-Language`, then `fallback`. Its options pass
  through: `createI18n({ resources, fallback, order: ['path', 'header'] })`.
- **Keys** are typed by the fallback's catalogue: `t('cart.itmes')` is a
  compile error. A key a language lacks answers itself.
- **`@nxgt/i18n`'s shared keys** — `errors.not-found`, `zod.*` — are yours by
  spreading its `resources` into your catalogues.

## Anywhere

```ts
// a service, or an error's message: no language passed
export const describeCart = (count: number) => i18n.t('cart.items', { count });
```

`i18n.t()` translates in the language of the request it runs in — through
every `await` — and in the fallback outside one. `i18n.language()` says
which.

### `@nxgt/i18n`'s own `translate`

`createI18n()` registers the request's language as one of `@nxgt/i18n`'s
language sources: its `getLanguage()` and `translate` — and every nxgt
package that translates through them, an error's message — speak the alxia
request's language too.

## Cached responses

A response in the request's language varies by what decided it: give
`@alxia/cache` the same headers, `vary: ['accept-language', 'cookie']`.

## API

| export | |
| --- | --- |
| `createI18n({ resources, fallback, …languageOptions })` | the plugin — routes after it read `t` and `language` — with `t()`, `language()` and `supported` |
| `KeyOf<Catalogue>`, `Translate<Key>`, `Catalogues` | its types |
