import "@typespec/openapi";

using TypeSpec.OpenAPI;

namespace Nxgt;

/**
 * A latitude in decimal degrees, WGS 84, from -90 to 90: `48.8566`. A number, never a string.
 */
@friendlyName("Latitude")
@minValue(-90)
@maxValue(90)
@extension("x-nxgt-scalar", "Latitude")
scalar latitude extends float64;
