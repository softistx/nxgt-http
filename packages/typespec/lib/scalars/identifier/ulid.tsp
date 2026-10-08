import "@typespec/openapi";

using TypeSpec.OpenAPI;

namespace Nxgt;

/**
 * A ULID: 26 characters of Crockford base32, the first 0 to 7 (128 bits), in any
 * case, kept as sent.
 *
 * Specified by https://github.com/ulid/spec.
 */
@friendlyName("ULID")
@format("ulid")
@pattern("^[0-7][0-9A-HJKMNP-TV-Za-hjkmnp-tv-z]{25}$")
@extension("x-nxgt-scalar", "ULID")
scalar ulid extends string;
