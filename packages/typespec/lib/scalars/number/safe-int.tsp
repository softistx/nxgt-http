import "@typespec/openapi";

using TypeSpec.OpenAPI;

namespace Nxgt;

/**
 * An integer, as GraphQL's `Int` writes it: no float, whole or not, and no
 * `-0`, which JSON Schema cannot express. From -9007199254740991 to
 * 9007199254740991, the integers JavaScript holds exactly.
 */
@friendlyName("SafeInt")
@minValue(-9007199254740991)
@maxValue(9007199254740991)
@extension("x-nxgt-scalar", "SafeInt")
scalar safeInt extends safeint;
