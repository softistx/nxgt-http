import "@typespec/openapi";

using TypeSpec.OpenAPI;

namespace Nxgt;

/**
 * A 48-bit MAC address: six hex pairs separated by `:`, in any case, kept as
 * sent: `00:1a:2b:3c:4d:5e`. The IEEE hyphen form and the dotted form are
 * refused.
 */
@friendlyName("MAC")
@format("mac")
@pattern("^(?:[0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$")
@extension("x-nxgt-scalar", "MAC")
scalar mac extends string;
