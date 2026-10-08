import "@typespec/openapi";

using TypeSpec.OpenAPI;

namespace Nxgt;

/**
 * An ISO 8601 duration, kept as sent and not normalised: `P1DT2H`. Weeks are not mixed with
 * other units, and there is no sign. Named `isoDuration` because `duration` is TypeSpec's own.
 *
 * Specified by https://www.iso.org/iso-8601-date-and-time-format.html.
 */
@friendlyName("Duration")
@format("duration")
@pattern("^P(?:\\d+W|(?!.*W)(?=\\d|T\\d)(?:\\d+Y)?(?:\\d+M)?(?:\\d+D)?(?:T(?=\\d)(?:\\d+H)?(?:\\d+M)?(?:\\d+(?:[.,]\\d+)?S)?)?)$")
@extension("x-nxgt-scalar", "Duration")
scalar isoDuration extends string;
