import "@typespec/openapi";

using TypeSpec.OpenAPI;

namespace Nxgt;

/**
 * A longitude in decimal degrees, WGS 84, from -180 to 180: `2.3522`. A number, never a string.
 */
@friendlyName("Longitude")
@minValue(-180)
@maxValue(180)
@extension("x-nxgt-scalar", "Longitude")
scalar longitude extends float64;
