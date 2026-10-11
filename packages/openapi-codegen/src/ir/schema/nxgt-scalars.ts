/**
 * The string scalars of `@nxgt/typespec` that `scalars: 'exact'` validates
 * with the schema of `@nxgt/zod`, by their `x-nxgt-scalar` name: the export to
 * import.
 *
 * Hardcoded on purpose, so that the generator never imports `@nxgt/zod`, an
 * optional peer that only the generated code needs. `nxgt-scalars.spec.ts`
 * holds it to the package's own `scalarSchemas`.
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

/** The bounds of a number, as the keywords of JSON Schema name them. */
export interface NumberBounds {
	minimum?: number;
	maximum?: number;
	exclusiveMinimum?: number;
	exclusiveMaximum?: number;
}

/**
 * A numeric scalar's `@nxgt/zod` export, whether its schema is an integer, and
 * the bounds that schema already enforces (a spec's bound it implies is not
 * checked a second time).
 */
export interface NumberScalar {
	schema: string;
	integer: boolean;
	bounds: NumberBounds;
}

const INT32 = { minimum: -2147483648, maximum: 2147483647 };
const SAFE = { minimum: -9007199254740991, maximum: 9007199254740991 };

/**
 * The numeric scalars of `@nxgt/typespec` that `scalars: 'exact'` validates
 * with the schema of `@nxgt/zod`, by their `x-nxgt-scalar` name. `integer` is
 * what the schema accepts: a spec that says `integer` of a float scalar (or
 * the reverse) is not the scalar, and keeps its bounds. `nxgt-scalars.spec.ts`
 * holds `bounds` to the JSON Schema of each `@nxgt/zod` schema.
 */
export const NUMBER_SCALARS: Readonly<Record<string, NumberScalar>> = {
	Latitude: {
		schema: 'latitudeSchema',
		integer: false,
		bounds: { minimum: -90, maximum: 90 },
	},
	Longitude: {
		schema: 'longitudeSchema',
		integer: false,
		bounds: { minimum: -180, maximum: 180 },
	},
	NegativeFloat: {
		schema: 'negativeFloatSchema',
		integer: false,
		bounds: { exclusiveMaximum: 0 },
	},
	NegativeInt: {
		schema: 'negativeIntSchema',
		integer: true,
		bounds: { minimum: INT32.minimum, exclusiveMaximum: 0 },
	},
	NonNegativeFloat: {
		schema: 'nonNegativeFloatSchema',
		integer: false,
		bounds: { minimum: 0 },
	},
	NonNegativeInt: {
		schema: 'nonNegativeIntSchema',
		integer: true,
		bounds: { minimum: 0, maximum: INT32.maximum },
	},
	NonPositiveFloat: {
		schema: 'nonPositiveFloatSchema',
		integer: false,
		bounds: { maximum: 0 },
	},
	NonPositiveInt: {
		schema: 'nonPositiveIntSchema',
		integer: true,
		bounds: { minimum: INT32.minimum, maximum: 0 },
	},
	Port: {
		schema: 'portSchema',
		integer: true,
		bounds: { minimum: 0, maximum: 65535 },
	},
	PositiveFloat: {
		schema: 'positiveFloatSchema',
		integer: false,
		bounds: { exclusiveMinimum: 0 },
	},
	PositiveInt: {
		schema: 'positiveIntSchema',
		integer: true,
		bounds: { exclusiveMinimum: 0, maximum: INT32.maximum },
	},
	SafeInt: { schema: 'safeIntSchema', integer: true, bounds: SAFE },
};

const KNOWN = new Set([
	...Object.keys(STRING_SCALARS),
	...CODEC_SCALARS,
	...Object.keys(NUMBER_SCALARS),
]);

/** Whether `name` is an `x-nxgt-scalar` that `@nxgt/typespec` declares. */
export const isNxgtScalar = (name: string): boolean => KNOWN.has(name);

/** The `@nxgt/zod` export that validates the string scalar `name`, if it has an exact one. */
export const exactSchema = (name: string): string | undefined =>
	Object.hasOwn(STRING_SCALARS, name) ? STRING_SCALARS[name] : undefined;

/**
 * The `@nxgt/zod` schema of the numeric scalar `name`, if it has one and
 * it is an integer exactly when the spec's is.
 */
export const exactNumberScalar = (
	name: string,
	integer: boolean,
): NumberScalar | undefined => {
	const scalar = Object.hasOwn(NUMBER_SCALARS, name)
		? NUMBER_SCALARS[name]
		: undefined;
	return scalar?.integer === integer ? scalar : undefined;
};
