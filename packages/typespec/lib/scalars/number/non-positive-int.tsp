import "@typespec/openapi";

using TypeSpec.OpenAPI;

namespace Nxgt;

/**
 * An integer, as GraphQL's `Int` writes it: no float, whole or not, and no
 * `-0`, which JSON Schema cannot express. From -2147483648 to 0.
 */
@friendlyName("NonPositiveInt")
@minValue(-2147483648)
@maxValue(0)
@extension("x-nxgt-scalar", "NonPositiveInt")
scalar nonPositiveInt extends int32;
