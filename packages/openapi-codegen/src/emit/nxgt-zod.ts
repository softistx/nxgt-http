import { list } from './printer';

/**
 * The scalars of `@nxgt/typespec` that `scalars: 'exact'` validates with the
 * schema of `@nxgt/zod`, by their `x-nxgt-scalar` name: the export to import.
 *
 * Hardcoded on purpose, so that the generator never imports `@nxgt/zod`, an
 * optional peer that only the generated code needs. `nxgt-zod.spec.ts` holds it
 * to the package's own `scalarSchemas`.
 */
export const STRING_SCALARS: Readonly<Record<string, string>> = {
	Base64: 'base64Schema',
	Base64URL: 'base64UrlSchema',
	CIDRv4: 'cidrv4Schema',
	CIDRv6: 'cidrv6Schema',
	CountryCode: 'countryCodeSchema',
	Cuid2: 'cuid2Schema',
	Currency: 'currencySchema',
	Date: 'dateSchema',
	Duration: 'durationSchema',
	EmailAddress: 'emailAddressSchema',
	Emoji: 'emojiSchema',
	GUID: 'guidSchema',
	HSLA: 'hslaSchema',
	HSL: 'hslSchema',
	HexColorCode: 'hexColorCodeSchema',
	Hexadecimal: 'hexadecimalSchema',
	Hostname: 'hostnameSchema',
	IBAN: 'ibanSchema',
	IP: 'ipSchema',
	IPv4: 'ipv4Schema',
	IPv6: 'ipv6Schema',
	ISBN: 'isbnSchema',
	JWT: 'jwtSchema',
	KSUID: 'ksuidSchema',
	LocalDateTime: 'localDateTimeSchema',
	LocalTime: 'localTimeSchema',
	Locale: 'localeSchema',
	MAC: 'macSchema',
	NanoID: 'nanoIdSchema',
	NonEmptyString: 'nonEmptyStringSchema',
	ObjectID: 'objectIdSchema',
	PhoneNumber: 'phoneNumberSchema',
	RGBA: 'rgbaSchema',
	RGB: 'rgbSchema',
	SHA256: 'sha256Schema',
	SHA512: 'sha512Schema',
	SemVer: 'semverSchema',
	Time: 'timeSchema',
	TimeZone: 'timeZoneSchema',
	ULID: 'ulidSchema',
	URL: 'urlSchema',
	UUID: 'uuidSchema',
	UUIDv4: 'uuidv4Schema',
	UUIDv7: 'uuidv7Schema',
	UtcOffset: 'utcOffsetSchema',
	XID: 'xidSchema',
};

/**
 * The codecs of `@nxgt/zod`, which change the output type (`DateTime` and
 * `Timestamp` decode to a `Date`, `BigInt` and `Long` to a `bigint`): they stay
 * on their `pattern`, as an exact schema would not be a drop-in replacement.
 */
export const CODEC_SCALARS: readonly string[] = [
	'BigInt',
	'DateTime',
	'Long',
	'Timestamp',
];

/** The numeric scalars, which `scalars: 'exact'` does not cover yet. */
export const NUMBER_SCALARS: readonly string[] = [
	'Latitude',
	'Longitude',
	'NegativeFloat',
	'NegativeInt',
	'NonNegativeFloat',
	'NonNegativeInt',
	'NonPositiveFloat',
	'NonPositiveInt',
	'Port',
	'PositiveFloat',
	'PositiveInt',
	'SafeInt',
];

const KNOWN = new Set([
	...Object.keys(STRING_SCALARS),
	...CODEC_SCALARS,
	...NUMBER_SCALARS,
]);

/** Whether `name` is an `x-nxgt-scalar` that `@nxgt/typespec` declares. */
export const isNxgtScalar = (name: string): boolean => KNOWN.has(name);

/** The `@nxgt/zod` export that validates the scalar `name`, if it has an exact one. */
export const exactSchema = (name: string): string | undefined =>
	Object.hasOwn(STRING_SCALARS, name) ? STRING_SCALARS[name] : undefined;

/** What a scope records, ahead of the export, when a schema needs it imported. */
const IMPORT_PREFIX = '@nxgt/zod:';

/** The mark that a printed schema calls the export `name`. */
export const nxgtImportMark = (name: string): string => IMPORT_PREFIX + name;

/**
 * The `import { … } from '@nxgt/zod';` line for what a file's scope recorded,
 * or none when it used no exact schema.
 */
export function nxgtImport(marks: Iterable<string>): string[] {
	const names = [...new Set(marks)]
		.filter((mark) => mark.startsWith(IMPORT_PREFIX))
		.map((mark) => mark.slice(IMPORT_PREFIX.length))
		.sort();
	return names.length === 0
		? []
		: [`import ${list('{ ', names, ' }', '')} from '@nxgt/zod';`];
}
