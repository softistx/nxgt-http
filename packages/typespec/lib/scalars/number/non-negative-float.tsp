import "@typespec/openapi";

using TypeSpec.OpenAPI;

namespace Nxgt;

/**
 * A finite number, 0 or above.
 */
@friendlyName("NonNegativeFloat")
@minValue(0)
@extension("x-nxgt-scalar", "NonNegativeFloat")
scalar nonNegativeFloat extends float64;
