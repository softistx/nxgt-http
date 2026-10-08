import "@typespec/openapi";

using TypeSpec.OpenAPI;

namespace Nxgt;

/**
 * An integer, as GraphQL's `Int` writes it: no float, whole or not, and no
 * `-0`, which JSON Schema cannot express. From 0 to 2147483647.
 */
@friendlyName("NonNegativeInt")
@minValue(0)
@maxValue(2147483647)
@extension("x-nxgt-scalar", "NonNegativeInt")
scalar nonNegativeInt extends int32;
