import "@typespec/openapi";

using TypeSpec.OpenAPI;

namespace Nxgt;

/**
 * An integer, as GraphQL's `Int` writes it: no float, whole or not, and no
 * `-0`, which JSON Schema cannot express. From 1 to 2147483647.
 */
@friendlyName("PositiveInt")
@minValue(1)
@maxValue(2147483647)
@extension("x-nxgt-scalar", "PositiveInt")
scalar positiveInt extends int32;
