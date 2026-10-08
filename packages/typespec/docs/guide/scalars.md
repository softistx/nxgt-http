# Scalars

The scalars of [`@nxgt/graphql-scalars`](https://www.npmjs.com/package/@nxgt/graphql-scalars)
as TypeSpec scalars, so a spec types a latitude, a currency or an IPv4 address
once and every generator and validator downstream agrees on it.

```tsp
import "@typespec/http";
import "@nxgt/typespec";

using Http;
using Nxgt;

@service(#{ title: "Places" })
namespace Places;

model Place {
  name: string;
  location: {
    latitude: latitude;
    longitude: longitude;
  };
  currency: currency;
  openedOn: date;
  homepage?: httpUrl;
  contact?: emailAddress;
  seats: positiveInt;
}

@route("/places") @post op createPlace(@body place: Place): Place;
```

Each property becomes a `$ref` to a component named as the GraphQL scalar:

```yaml
components:
  schemas:
    Currency:
      type: string
      pattern: ^[A-Z]{3}$
      format: currency
      description: |-
        An ISO 4217 currency code, uppercase: `EUR`, `USD`. ...
      x-nxgt-scalar: Currency
    Latitude:
      type: number
      format: double
      minimum: -90
      maximum: 90
      x-nxgt-scalar: Latitude
    PositiveInt:
      type: integer
      format: int32
      minimum: 1
      maximum: 2147483647
      x-nxgt-scalar: PositiveInt
```

## What a scalar emits

| Emitted | Value |
| --- | --- |
| The component | The GraphQL name (`@friendlyName`): `Latitude`, `CIDRv4`, `EmailAddress`. It is global: a model of that name in your spec collides with it. |
| `format` | JSON Schema's when one exists (`date`, `date-time`, `duration`, `email`, `hostname`, `ipv4`, `ipv6`, `uri`, `uuid`), otherwise the kebab-case name (`iban`, `local-time`, `cidr-v4`); `base64` has OpenAPI's `byte`. The numbers keep the format TypeSpec writes from the base type. |
| `pattern`, `minimum`, `maximum` | The closest the GraphQL rule goes in a pattern or in bounds. |
| `x-nxgt-scalar` | The GraphQL name, so a generator can tell the rule from the shape. |
| `description` | The rule in words, and what the pattern leaves out. |

A generator that knows nothing of `x-nxgt-scalar` still validates the pattern
and the bounds. A later `@nxgt/openapi-codegen` release will map it to the exact
Zod schema from `@nxgt/zod` ([roadmap](../roadmap.md)); until then, what a
scalar leaves out is not checked.

## Names

The identifiers are camelCase: `ipV4`, `cidrV6`, `uuidV7`, `hexColorCode`. The
component keeps the GraphQL spelling.

- `url` and `duration` are TypeSpec built-ins, and a scalar of that name makes
  `url` ambiguous under `using Nxgt`. They are `httpUrl` and `isoDuration`.
- `JSON`, `JSONObject` and `Void` are not declared: write TypeSpec's own
  `unknown`, `Record<unknown>` and `void`.
- A declaration of yours named like a scalar shadows it. In a spec with an
  operation `locale`, write `Nxgt.locale`.

```tsp
@get op locale(): string;                 // yours
model Page { language: Nxgt.locale; }    // the scalar
```

## Identifiers

`uuid`, with the id columns, is also in [Scalars and columns](columns.md).

| Scalar | Component | Format | Takes | Left out of the pattern |
| --- | --- | --- | --- | --- |
| `uuid` | `UUID` | `uuid` | `550e8400-e29b-41d4-a716-446655440000`, the nil and the max UUID | |
| `uuidV4` | `UUIDv4` | `uuid` | `123e4567-e89b-42d3-a456-426614174000` | |
| `uuidV7` | `UUIDv7` | `uuid` | `017f22e2-79b0-7cc3-98c4-dc0c0c07398f` | |
| `guid` | `GUID` | `uuid` | any 8-4-4-4-12 hexadecimal, `123e4567-e89b-12d3-c456-426614174000` | no version, no variant |
| `ulid` | `ULID` | `ulid` | `01ARZ3NDEKTSV4RRFFQ69G5FAV`: 26 Crockford base32 characters, the first 0 to 7, any case | |
| `cuid2` | `Cuid2` | `cuid2` | `tz4a98xxat96iws9zmbrgj3a`, `ab`: a lowercase letter, then lowercase letters and digits, 2 to 32 characters | |
| `nanoId` | `NanoID` | `nano-id` | `V1StGXR8_Z5jdHi6B-myT`: 21 characters of `A-Za-z0-9_-`; a custom length is refused | |
| `ksuid` | `KSUID` | `ksuid` | `0ujtsYcgvSTl8PAuAdqWYSMnLOv`: 27 base62 characters, up to `aWgEPTl1tmebfsQzFP4bxwgy80V` | |
| `xid` | `XID` | `xid` | `9m4e2mr0ui3e8a215n4g`: 20 lowercase base32hex characters, the last `0` or `g` | |
| `objectId` | `ObjectID` | `object-id` | `507f1f77bcf86cd799439011`: 24 hexadecimal digits, any case | |
| `isbn` | `ISBN` | `isbn` | `0306406152`, `080442957X`, `9780306406157`: digits only, no hyphen | the check digit (`9780306406158` passes) |
| `semVer` | `SemVer` | `sem-ver` | `1.2.3`, `1.0.0-rc.1+build.5`: no `v` prefix, no leading zero | |

`uuid` refuses a UUID of no known version (`...-91d4-...`); `guid` is the shape
only. Case is kept as sent.

## Encodings

| Scalar | Component | Format | Takes | Left out of the pattern |
| --- | --- | --- | --- | --- |
| `base64` | `Base64` | `byte` | `aGk=`, `a+b/`, `""`: RFC 4648 with padding, in its one canonical spelling (`YR==` is refused) | |
| `base64Url` | `Base64URL` | `base64-url` | `aGk`, `a-b_`: `-` and `_`, no padding, canonical | |
| `hexadecimal` | `Hexadecimal` | `hexadecimal` | `deadBEEF`, `abc`: one or more digits, any case, no `0x` | |
| `jwt` | `JWT` | `jwt` | three base64url parts joined by `.`, `eyJhbGci….eyJzdWIi….dozjgNry…` | that each part is canonical and the first two are JSON objects, `alg: none`, the signature |
| `sha256` | `SHA256` | `sha256` | 64 hexadecimal digits, any case | |
| `sha512` | `SHA512` | `sha512` | 128 hexadecimal digits, any case | |

`base64` carries the OpenAPI format `byte`, which the generator turns into
`z.base64()` in front of the pattern (`zBase64 = z.base64().regex(…)`); the
others are `z.string().regex(…)`. A `jwt` is a shape, not a verification: check
the token's signature in your code.

## Strings

| Scalar | Component | Format | Takes | Left out of the pattern |
| --- | --- | --- | --- | --- |
| `nonEmptyString` | `NonEmptyString` | `non-empty-string` | `a`, ` a `: at least one non-white-space character (ECMAScript `\s`); kept as sent, not trimmed; `""`, `"   "` and a lone no-break space are refused | |
| `emoji` | `Emoji` | `emoji` | `😀`, `👍🏽`, `👨‍👩‍👧`, `🇫🇷`, `1️⃣`: exactly one emoji | tag sequences (the flags of England, Scotland, Wales), segmentation into user-perceived characters, so two emoji in a row may pass |

The `emoji` pattern uses Unicode property escapes and needs the `u` flag;
the generated Zod regex has it.

## Numbers

Numbers are JSON numbers, except `BigInt` and `Long`, which are decimal strings
because a JSON number loses precision past 2^53.

| Scalar | Component | Format | Takes | Left out of the pattern |
| --- | --- | --- | --- | --- |
| `positiveInt` | `PositiveInt` | `int32` | `1` to `2147483647` | `-0` |
| `nonNegativeInt` | `NonNegativeInt` | `int32` | `0` to `2147483647` | `-0` |
| `negativeInt` | `NegativeInt` | `int32` | `-2147483648` to `-1` | `-0` |
| `nonPositiveInt` | `NonPositiveInt` | `int32` | `-2147483648` to `0` | `-0` |
| `safeInt` | `SafeInt` | `int64` | the integers JavaScript holds exactly, `-9007199254740991` to `9007199254740991` | `-0` |
| `port` | `Port` | `int32` | `0` to `65535` | `-0` |
| `positiveFloat` | `PositiveFloat` | `double` | `0.5`, above 0 | |
| `nonNegativeFloat` | `NonNegativeFloat` | `double` | `0`, `1.5` | |
| `negativeFloat` | `NegativeFloat` | `double` | `-0.5`, below 0 | |
| `nonPositiveFloat` | `NonPositiveFloat` | `double` | `0`, `-1.5` | |
| `bigInt` | `BigInt` | `big-int` | `"123456789012345678901234567890"`: no leading zero, no `+`, no `-0` | |
| `long` | `Long` | `int64` | `"9223372036854775807"`, the signed 64-bit range | |

`long` is a string with `format: int64`, the OpenAPI idiom for an int64 sent as
a string; `timestamp` and `safeInt` are JSON numbers with the same format.

An integer scalar accepts `-0`, which GraphQL refuses and no JSON Schema can
express.

## Date and time

| Scalar | Component | Format | Takes | Left out of the pattern |
| --- | --- | --- | --- | --- |
| `date` | `Date` | `date` | `2024-02-29` (an impossible day is refused) | |
| `dateTime` | `DateTime` | `date-time` | `2024-03-10T12:00:00+02:00`: an offset is required, `-00:00` refused | the range 0000 to 9999 in UTC, the leap second |
| `time` | `Time` | `time` | `10:15:30Z`, `10:15:30.5+02:00` | |
| `localDateTime` | `LocalDateTime` | `local-date-time` | `2024-03-10T10:15`, `2024-03-10T10:15:30`: no offset | |
| `localTime` | `LocalTime` | `local-time` | `10:15`, `10:15:30.5`: no offset | |
| `isoDuration` | `Duration` | `duration` | `P1Y2M3DT4H5M6S`, `PT0.5S`, `P2W`: weeks alone, no sign | |
| `utcOffset` | `UtcOffset` | `utc-offset` | `+05:30`, from `-12:00` to `+14:00`; `-00:00` refused | |
| `timeZone` | `TimeZone` | `time-zone` | `Europe/Paris`, `UTC` | the list of IANA names |
| `timestamp` | `Timestamp` | `int64` | milliseconds since the epoch, `1710065730000`, within ±8640000000000000 | |

A well-shaped unknown time zone name (`Mars/Olympus`) passes
([Known gaps](#known-gaps)).

## Geo

| Scalar | Component | Format | Takes | Left out of the pattern |
| --- | --- | --- | --- | --- |
| `latitude` | `Latitude` | `double` | `48.8566`, from -90 to 90 | |
| `longitude` | `Longitude` | `double` | `2.3522`, from -180 to 180 | |

Both are numbers, never strings.

## Colors

CSS color syntax, in the comma form, one space after each comma.

| Scalar | Component | Format | Takes | Left out of the pattern |
| --- | --- | --- | --- | --- |
| `hexColorCode` | `HexColorCode` | `hex-color-code` | `#f00`, `#f008`, `#ff0000`, `#ff000080`, any case | |
| `rgb` | `RGB` | `rgb` | `rgb(255, 0, 0)`; no percentage, no leading zero | |
| `rgba` | `RGBA` | `rgba` | `rgba(255, 0, 0, 0.5)`: the alpha is `0`, `1` or a fraction with a leading `0` and no trailing zero | |
| `hsl` | `HSL` | `hsl` | `hsl(120, 100%, 50%)`: hue 0 to 359, no unit | |
| `hsla` | `HSLA` | `hsla` | `hsla(120, 100%, 50%, 0.5)` | |

`rgb(255,0,0)`, `rgb(255 0 0)` and `RGB(255, 0, 0)` are refused.

## Network

| Scalar | Component | Format | Takes | Left out of the pattern |
| --- | --- | --- | --- | --- |
| `emailAddress` (alias `email`) | `EmailAddress` | `email` | `ada@example.com`, `a.b+c@sub.example.org`: no quoted local part, at least two labels | whether the domain exists |
| `hostname` | `Hostname` | `hostname` | `api.example.com`, `localhost`, `xn--bcher-kva.example`; not `1.2.3.4`, not Unicode | nothing is resolved |
| `httpUrl` | `URL` | `uri` | `https://example.com/a?b=c`, `http://localhost:3000`, `https://[2001:db8::1]/`; no other scheme, no user info | |
| `ipV4` | `IPv4` | `ipv4` | `192.168.0.1`: no leading zero | |
| `ipV6` | `IPv6` | `ipv6` | `2001:db8::1`, `::1`, `::ffff:192.0.2.1`, any case; no zone | |
| `ip` | `IP` | `ip` | either of the two | |
| `cidrV4` | `CIDRv4` | `cidr-v4` | `10.0.0.0/8`, `0.0.0.0/0` | that the address starts its block |
| `cidrV6` | `CIDRv6` | `cidr-v6` | `2001:db8::/32`, `::/0` | that the address starts its block |
| `mac` | `MAC` | `mac` | `00:1a:2b:3c:4d:5e`; not the hyphen or dotted form | |
| `phoneNumber` | `PhoneNumber` | `phone-number` | `+33612345678`: E.164, 7 to 15 digits, no separator | whether the number exists |

`httpUrl` is for a page's address; it is generated as `zURL = z.url().regex(…)`,
so `z.url()` checks the shape and the pattern keeps to `http:` and `https:`
(`javascript:alert(1)` passes `z.url()` alone and is refused by the pattern).
TypeSpec's own `url` takes any scheme and is generated as a bare `z.url()`.

## Locale

| Scalar | Component | Format | Takes | Left out of the pattern |
| --- | --- | --- | --- | --- |
| `countryCode` | `CountryCode` | `country-code` | `FR`, `US`: ISO 3166-1 alpha-2, uppercase | the list of assigned codes (`ZZ` passes) |
| `locale` | `Locale` | `locale` | `fr`, `fr-FR`, `zh-Hant-TW`, `en-US-u-ca-buddhist`: BCP 47 in canonical case, up to 255 characters | the IANA registry, the order of extensions |

## Finance

| Scalar | Component | Format | Takes | Left out of the pattern |
| --- | --- | --- | --- | --- |
| `currency` | `Currency` | `currency` | `EUR`, `USD`: ISO 4217, uppercase | the list of codes (`ZZZ` passes) |
| `iban` | `IBAN` | `iban` | `FR1420041010050500013M02606`: uppercase, no spaces | the mod 97 checksum, the country and its length |

## Values

`JSON`, `JSONObject` and `Void` are not scalars here. Write `unknown`,
`Record<unknown>` and `void`.

## In a route

The scalars work anywhere a type does: a path, a query, a header, a body.

```tsp
import "@typespec/http";
import "@nxgt/typespec";

using Http;
using Nxgt;

@service(#{ title: "Inventory" })
namespace Inventory;

model Host {
  @visibility(Lifecycle.Read) id: uuid;
  name: hostname;
  address: ip;
  network: cidrV4;
  port: port;
}

@route("/hosts")
interface Hosts {
  @get list(@query ipPrefix?: cidrV4): Host[];
  @get @route("{hostId}") read(@path hostId: uuid): Host;
}
```

A request that breaks a pattern or a bound is answered `400` by the generated
validator, the same as any other schema.

## Known gaps

The pattern is an approximation. Four things a consumer meets:

- The generated code also applies the standard format's Zod check, in front
  of the pattern: `z.email()` for `format: email`, `z.url()` for `uri`,
  `z.base64()` for `byte`, `z.guid()` for `uuid`. `z.email()` refuses
  `ada@x.xn--p1ai` (and any top-level domain with a digit or hyphen), which
  the pattern accepts, so that address is refused.
- `long` is a string with `format: int64`, the OpenAPI idiom for an int64 sent as
a string; `timestamp` and `safeInt` are JSON numbers with the same format.

An integer scalar accepts `-0`.
- A scalar that depends on a list (`countryCode`, `currency`, `timeZone`, the
  `iban` checksum, the `locale` registry) accepts a well-shaped unknown value
  until the generator maps `x-nxgt-scalar` to `@nxgt/zod`.
- A declaration named like a scalar shadows it: write `Nxgt.locale`.

See also [Scalars and columns](columns.md) for `uuid`, `email` and the columns,
and the [troubleshooting](../troubleshooting.md) page.
