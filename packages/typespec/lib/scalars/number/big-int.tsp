import "@typespec/openapi";

using TypeSpec.OpenAPI;

namespace Nxgt;

/**
 * An integer of any size, written as a canonical decimal string: no leading
 * zero, no `+`, no `-0`, no spaces: `"123456789012345678901234567890"`.
 */
@friendlyName("BigInt")
@format("big-int")
@pattern("^(?:0|-?[1-9]\\d*)$")
@extension("x-nxgt-scalar", "BigInt")
scalar bigInt extends string;
