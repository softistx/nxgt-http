import "@typespec/openapi";

using TypeSpec.OpenAPI;

namespace Nxgt;

/**
 * An instant as an integer number of milliseconds since 1970-01-01T00:00:00Z, negative before
 * 1970, within the range of a JavaScript `Date`, ±8640000000000000: `1710065730000`.
 */
@friendlyName("Timestamp")
@minValue(-8640000000000000)
@maxValue(8640000000000000)
@extension("x-nxgt-scalar", "Timestamp")
scalar timestamp extends safeint;
