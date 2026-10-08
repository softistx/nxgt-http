import "@typespec/openapi";

using TypeSpec.OpenAPI;

namespace Nxgt;

/**
 * An IANA time zone name in its exact case, kept as sent: `Europe/Paris`, `UTC`. Only the shape
 * is checked, one to three words of letters, digits, `+`, `-` and `_`, each starting with a capital;
 * the list of names is not in the pattern.
 *
 * Specified by https://www.iana.org/time-zones.
 */
@friendlyName("TimeZone")
@format("time-zone")
@pattern("^[A-Z][A-Za-z0-9+\\-_]*(?:/[A-Z][A-Za-z0-9+\\-_]*){0,2}$")
@extension("x-nxgt-scalar", "TimeZone")
scalar timeZone extends string;
