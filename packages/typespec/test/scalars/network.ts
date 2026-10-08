import type { Entry } from './entry';

export const network: readonly Entry[] = [
	{
		name: 'EmailAddress',
		scalar: 'emailAddress',
		format: 'email',
		// `ada@x.xn--p1ai` matches the pattern, but the generator's z.email(),
		// for `format: email`, refuses a punycode top-level label.
		accept: ['ada@example.com', 'a.b+c@sub.example.org'],
		refuse: [
			'ada',
			'ada@',
			'a b@example.com',
			'ada@localhost',
			'ada@a-.com',
			'ada@x.c0m',
		],
	},
];
