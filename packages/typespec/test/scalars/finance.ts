import type { Entry } from './entry';

export const finance: readonly Entry[] = [
	{
		name: 'Currency',
		scalar: 'currency',
		format: 'currency',
		specifiedBy: 'https://www.iso.org/iso-4217-currency-codes.html',
		// `ZZZ` (not a code) and the withdrawn `FRF`, `HRK` and `SLL` match the shape;
		// the list of codes is not in the pattern.
		accept: ['EUR', 'USD', 'JPY', 'CHF', 'XAU', 'XXX'],
		refuse: ['eur', 'Eur', 'EU', 'EURO', ' EUR', ''],
	},
	{
		name: 'IBAN',
		scalar: 'iban',
		format: 'iban',
		specifiedBy: 'https://www.iso.org/standard/81090.html',
		// `FR1420041010050500013M02607` (wrong check digit), `XX…` and `DE41370400440532013` (wrong length)
		// match the shape; the checksum, the country and its length are not in the pattern.
		accept: [
			'FR1420041010050500013M02606',
			'DE89370400440532013000',
			'GB82WEST12345698765432',
			'NO9386011117947',
			'LC55HEMM000100010012001200023015',
		],
		refuse: [
			'fr1420041010050500013m02606',
			'FR14 2004 1010 0505 0001 3M02 606',
			'',
		],
	},
];
