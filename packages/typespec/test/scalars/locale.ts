import type { Entry } from './entry';

export const locale: readonly Entry[] = [
	{
		name: 'CountryCode',
		scalar: 'countryCode',
		format: 'country-code',
		specifiedBy: 'https://www.iso.org/iso-3166-country-codes.html',
		// `ZZ`, `UK`, `EU`, `SU` and `XK` match the pattern: the list of codes is
		// not in it.
		accept: ['FR', 'US', 'GB', 'AX', 'SS'],
		refuse: ['fr', 'Fr', 'FRA', 'F', ' FR'],
	},
	{
		name: 'Locale',
		scalar: 'locale',
		format: 'locale',
		specifiedBy: 'https://www.rfc-editor.org/rfc/rfc5646',
		// `en-u-nu-latn-ca-buddhist` (extension keys out of order) matches the
		// pattern, which keeps the shape and the case, not the order of extensions.
		accept: [
			'fr',
			'fr-FR',
			'en-US',
			'zh-Hant-TW',
			'sr-Latn',
			'es-419',
			'en-US-u-ca-buddhist',
			'und',
		],
		refuse: ['fr-fr', 'FR', 'en_US', 'zh-hant-tw', 'x-foo', 'en-', ' fr'],
	},
];
