import "@typespec/openapi";

using TypeSpec.OpenAPI;

namespace Nxgt;

/**
 * An XID: 20 characters of lowercase base32hex (`0-9`, `a-v`). 12 bytes leave 4
 * bits unused, so the last character is `0` or `g`.
 *
 * Specified by https://github.com/rs/xid.
 */
@friendlyName("XID")
@format("xid")
@pattern("^[0-9a-v]{19}[0g]$")
@extension("x-nxgt-scalar", "XID")
scalar xid extends string;
