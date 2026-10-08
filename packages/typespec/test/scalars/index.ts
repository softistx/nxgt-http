/**
 * Every scalar of `lib/scalars/`, by category: the registry
 * `src/scalars.spec.ts` holds against the files, the emitted spec and the
 * generated validators. A category is a file here, a folder of `.tsp` there.
 */
import { color } from './color';
import { dateTime } from './date-time';
import { encoding } from './encoding';
import type { Entry } from './entry';
import { finance } from './finance';
import { geo } from './geo';
import { identifier } from './identifier';
import { locale } from './locale';
import { network } from './network';
import { number } from './number';
import { string } from './string';
import { value } from './value';

export type { BuiltinEntry, Entry, ScalarEntry } from './entry';

export const CATEGORIES: Readonly<Record<string, readonly Entry[]>> = {
	color,
	'date-time': dateTime,
	encoding,
	finance,
	geo,
	identifier,
	locale,
	network,
	number,
	string,
	value,
};

/**
 * The 65 scalars @nxgt/graphql-scalars 0.3.2 to 0.4.0 ship (0.4.0 added no scalar), by name: the parity the
 * registry is held to. A scalar added there is added here, then to a category.
 */
export const GRAPHQL_SCALARS = [
	'Base64',
	'Base64URL',
	'BigInt',
	'CIDRv4',
	'CIDRv6',
	'CountryCode',
	'Cuid2',
	'Currency',
	'Date',
	'DateTime',
	'Duration',
	'EmailAddress',
	'Emoji',
	'GUID',
	'HSL',
	'HSLA',
	'HexColorCode',
	'Hexadecimal',
	'Hostname',
	'IBAN',
	'IP',
	'IPv4',
	'IPv6',
	'ISBN',
	'JSON',
	'JSONObject',
	'JWT',
	'KSUID',
	'Latitude',
	'LocalDateTime',
	'LocalTime',
	'Locale',
	'Long',
	'Longitude',
	'MAC',
	'NanoID',
	'NegativeFloat',
	'NegativeInt',
	'NonEmptyString',
	'NonNegativeFloat',
	'NonNegativeInt',
	'NonPositiveFloat',
	'NonPositiveInt',
	'ObjectID',
	'PhoneNumber',
	'Port',
	'PositiveFloat',
	'PositiveInt',
	'RGB',
	'RGBA',
	'SHA256',
	'SHA512',
	'SafeInt',
	'SemVer',
	'Time',
	'TimeZone',
	'Timestamp',
	'ULID',
	'URL',
	'UUID',
	'UUIDv4',
	'UUIDv7',
	'UtcOffset',
	'Void',
	'XID',
] as const;
