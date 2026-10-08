import "@typespec/openapi";

using TypeSpec.OpenAPI;

namespace Nxgt;

/**
 * An ISO 3166-1 alpha-2 country code, uppercase: `FR`, `US`. The list of
 * assigned codes is not in the pattern: only the shape is.
 *
 * Specified by https://www.iso.org/iso-3166-country-codes.html.
 */
@friendlyName("CountryCode")
@format("country-code")
@pattern("^[A-Z]{2}$")
@extension("x-nxgt-scalar", "CountryCode")
scalar countryCode extends string;
