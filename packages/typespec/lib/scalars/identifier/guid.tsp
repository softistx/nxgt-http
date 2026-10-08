import "@typespec/openapi";

using TypeSpec.OpenAPI;

namespace Nxgt;

/** Any 8-4-4-4-12 hexadecimal string, no version or variant check, in any case, kept as sent. */
@friendlyName("GUID")
@format("uuid")
@pattern("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")
@extension("x-nxgt-scalar", "GUID")
scalar guid extends string;
