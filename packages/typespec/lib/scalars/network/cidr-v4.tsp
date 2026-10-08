import "@typespec/openapi";

using TypeSpec.OpenAPI;

namespace Nxgt;

/**
 * An IPv4 block in CIDR notation: a dotted-quad address, `/` and a prefix
 * length from 0 to 32, kept as sent: `10.0.0.0/8`. Each part of the address
 * is 0 to 255 with no leading zero. The address need not be the first of the
 * block.
 *
 * Specified by https://www.rfc-editor.org/rfc/rfc4632.
 */
@friendlyName("CIDRv4")
@format("cidr-v4")
@pattern("^(?:(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)\\.){3}(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)/(?:3[0-2]|[12]?\\d)$")
@extension("x-nxgt-scalar", "CIDRv4")
scalar cidrV4 extends string;
