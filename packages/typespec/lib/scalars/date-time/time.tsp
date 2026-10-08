import "@typespec/openapi";

using TypeSpec.OpenAPI;

namespace Nxgt;

/**
 * An RFC 3339 `full-time`, kept as sent: seconds, an optional fraction, then `Z` or `±hh:mm`,
 * such as `10:15:30+02:00`. A time with no offset is refused, and so is `-00:00`.
 *
 * Specified by https://www.rfc-editor.org/rfc/rfc3339#section-5.6.
 */
@friendlyName("Time")
@format("time")
@pattern("^(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d)(?:\\.\\d+)?(?:Z|\\+(?:[01]\\d|2[0-3]):[0-5]\\d|-(?!00:00)(?:[01]\\d|2[0-3]):[0-5]\\d)$")
@extension("x-nxgt-scalar", "Time")
scalar time extends string;
