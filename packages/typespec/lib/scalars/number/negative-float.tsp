import "@typespec/openapi";

using TypeSpec.OpenAPI;

namespace Nxgt;

/**
 * A finite number below 0.
 */
@friendlyName("NegativeFloat")
@maxValueExclusive(0)
@extension("x-nxgt-scalar", "NegativeFloat")
scalar negativeFloat extends float64;
