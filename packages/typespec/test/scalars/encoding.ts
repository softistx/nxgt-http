import type { Entry } from './entry';

export const encoding: readonly Entry[] = [
	{
		name: 'Base64',
		scalar: 'base64',
		format: 'byte',
		specifiedBy: 'https://www.rfc-editor.org/rfc/rfc4648#section-4',
		accept: ['', 'YQ==', 'aGk=', 'a+b/'],
		refuse: ['aGk', 'aGk==', 'a-b_', 'a b', 'a\nb', 'YR=='],
	},
	{
		name: 'Base64URL',
		scalar: 'base64Url',
		format: 'base64-url',
		specifiedBy: 'https://www.rfc-editor.org/rfc/rfc4648#section-5',
		accept: ['', 'YQ', 'aGk', 'a-b_'],
		refuse: ['aGk=', 'a+b/', 'a b', 'YR'],
	},
	{
		name: 'Hexadecimal',
		scalar: 'hexadecimal',
		format: 'hexadecimal',
		accept: ['deadBEEF', 'abc', 'AB'],
		refuse: ['', '0x1f', 'de ad', 'xyz'],
	},
	{
		name: 'JWT',
		scalar: 'jwt',
		format: 'jwt',
		specifiedBy: 'https://www.rfc-editor.org/rfc/rfc7519',
		// `a.b.c` matches the pattern, which leaves out the spelling of each
		// part and the JSON inside them.
		accept: [
			'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U',
		],
		refuse: ['eyJhbGciOiJub25lIn0.eyJzdWIiOiIxIn0.', 'a.b', 'a.b.c.d', ''],
	},
	{
		name: 'SHA256',
		scalar: 'sha256',
		format: 'sha256',
		specifiedBy: 'https://csrc.nist.gov/pubs/fips/180-4/upd1/final',
		accept: ['A'.repeat(64), 'a1'.repeat(32)],
		refuse: [
			'abc',
			'a'.repeat(63),
			'a'.repeat(65),
			'g'.repeat(64),
			'a'.repeat(128),
			'',
		],
	},
	{
		name: 'SHA512',
		scalar: 'sha512',
		format: 'sha512',
		specifiedBy: 'https://csrc.nist.gov/pubs/fips/180-4/upd1/final',
		accept: ['f'.repeat(128), 'A1'.repeat(64)],
		refuse: ['a'.repeat(64), 'a'.repeat(127), 'a'.repeat(129), ''],
	},
];
