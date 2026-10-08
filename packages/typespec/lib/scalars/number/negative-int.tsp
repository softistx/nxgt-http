import "@typespec/openapi";

using TypeSpec.OpenAPI;

namespace Nxgt;

/**
 * An integer, as GraphQL's `Int` writes it: no float, whole or not, and no
 * `-0`, which JSON Schema cannot express. From -2147483648 to -1.
 */
@friendlyName("NegativeInt")
@minValue(-2147483648)
@maxValue(-1)
@extension("x-nxgt-scalar", "NegativeInt")
scalar negativeInt extends int32;
