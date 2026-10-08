import "@typespec/openapi";

using TypeSpec.OpenAPI;

namespace Nxgt;

/**
 * A finite number, 0 or below.
 */
@friendlyName("NonPositiveFloat")
@maxValue(0)
@extension("x-nxgt-scalar", "NonPositiveFloat")
scalar nonPositiveFloat extends float64;
