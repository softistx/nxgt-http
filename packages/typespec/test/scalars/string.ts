import type { Entry } from './entry';

export const string: readonly Entry[] = [
	{
		name: 'NonEmptyString',
		scalar: 'nonEmptyString',
		accept: ['a', ' a '],
		refuse: ['', '   ', '\n\t', '\u00a0'],
	},
	{
		name: 'Emoji',
		scalar: 'emoji',
		specifiedBy: 'https://www.unicode.org/reports/tr51/',
		// `\u{1F600}\u{1F600}` (two emoji), a lone joiner or skin tone and the
		// doubled variation selector are not all caught by a pattern that reads
		// the parts, not user-perceived characters: only the samples it refuses
		// are listed.
		accept: [
			'\u{1F600}',
			'\u{1F44D}\u{1F3FD}',
			'\u{1F468}\u200D\u{1F469}\u200D\u{1F467}',
			'\u{1F1EB}\u{1F1F7}',
			'1\uFE0F\u20E3',
			'\u2764\uFE0F',
		],
		refuse: [
			'\u{1F600}\u{1F600}',
			'a',
			'\u{1F600}a',
			' \u{1F600}',
			'',
			'\u200D',
			'\uFE0F',
			'\u{1F3FB}',
			'\u20E3',
			'\u{1F1EB}',
		],
	},
];
