import "@typespec/openapi";

using TypeSpec.OpenAPI;

namespace Nxgt;

/**
 * One or more hexadecimal digits, in any case, kept as sent. An odd length is
 * fine; no `0x` prefix.
 */
@friendlyName("Hexadecimal")
@format("hexadecimal")
@pattern("^[0-9a-fA-F]+$")
@extension("x-nxgt-scalar", "Hexadecimal")
scalar hexadecimal extends string;
