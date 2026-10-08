import "@typespec/openapi";

using TypeSpec.OpenAPI;

namespace Nxgt;

/**
 * A TCP or UDP port, an integer from 0 to 65535.
 */
@friendlyName("Port")
@minValue(0)
@maxValue(65535)
@extension("x-nxgt-scalar", "Port")
scalar port extends int32;
