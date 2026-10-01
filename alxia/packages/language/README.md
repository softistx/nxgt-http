# @alxia/language

The request's language for [alxia](https://www.npmjs.com/package/@alxia/core),
typed as the languages you support — never a string a client made up. No
dependency.

```sh
bun add @alxia/language
```

## Usage

```ts
import { language } from '@alxia/language';

const app = alxia()
	.use(language({ supported: ['en', 'fr', 'pt-BR'], fallback: 'en' }))
	.get('/', ({ language, reply }) => reply(200, greetings[language])); // 'en' | 'fr' | 'pt-BR'
```

It reads, in `order`:

| source | |
| --- | --- |
| `query` | `?lang=fr` |
| `cookie` | `language=fr` |
| `path` | `/fr/products`, at `pathIndex` |
| `header` | `Accept-Language`, by weight: `de, fr-CA;q=0.8` is `fr` |

then `resolve(ctx)` — a user's saved preference — then `fallback`. A tag
matches whatever its case, by its base language (`fr-CA` for `fr`), or by a
region of it (`pt` for `pt-BR`). `languageSource` says which source decided.

Every response says `Content-Language`, and `Vary` by the headers it read.
With `persist`, a language the query named is kept in the cookie.

## Options

| option | default | |
| --- | --- | --- |
| `supported` | required | the languages: `language`'s type |
| `fallback` | required | one of them; the types refuse another |
| `order` | `['query', 'cookie', 'header']` | |
| `query`, `cookie` | `lang`, `language` | their names |
| `pathIndex` | 0 | |
| `persist` | `false` | `true`, or `{ maxAge, secure }` |
| `contentLanguage` | `true` | |
| `resolve` | none | `(ctx) => string \| undefined` |

## API

| export | |
| --- | --- |
| `language(options)` | the plugin: `language`, `languageSource` |
| `negotiate(header, supported)` | the supported language `Accept-Language` prefers |
| `parseAcceptLanguage(header)`, `match(tag, supported)` | its parts |
