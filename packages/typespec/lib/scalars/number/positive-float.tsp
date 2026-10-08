import "@typespec/openapi";

using TypeSpec.OpenAPI;

namespace Nxgt;

/**
 * A finite number above 0.
 */
@friendlyName("PositiveFloat")
@minValueExclusive(0)
@extension("x-nxgt-scalar", "PositiveFloat")
scalar positiveFloat extends float64;
