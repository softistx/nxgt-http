import "@typespec/openapi";

using TypeSpec.OpenAPI;

namespace Nxgt;

/**
 * A time of day with no offset, `HH:MM`, `HH:MM:SS` or with a fraction: `10:15`. It names no
 * instant until a date and a place are given; a `Z` or an offset is refused.
 */
@friendlyName("LocalTime")
@format("local-time")
@pattern("^(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?$")
@extension("x-nxgt-scalar", "LocalTime")
scalar localTime extends string;
