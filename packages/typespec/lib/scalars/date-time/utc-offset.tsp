import "@typespec/openapi";

using TypeSpec.OpenAPI;

namespace Nxgt;

/**
 * A fixed offset from UTC, `±hh:mm`, from `-12:00` to `+14:00`: `+05:30`. It is not a place and
 * knows nothing of daylight saving. `-00:00` is refused: write `+00:00`.
 */
@friendlyName("UtcOffset")
@format("utc-offset")
@pattern("^(?:\\+(?:0\\d|1[0-3]):[0-5]\\d|\\+14:00|-(?!00:00)(?:0\\d|1[01]):[0-5]\\d|-12:00)$")
@extension("x-nxgt-scalar", "UtcOffset")
scalar utcOffset extends string;
