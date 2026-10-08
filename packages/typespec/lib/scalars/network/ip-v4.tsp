import "@typespec/openapi";

using TypeSpec.OpenAPI;

namespace Nxgt;

/**
 * An IPv4 address in dotted-quad form: `192.168.0.1`. Each part is 0 to 255
 * with no leading zero.
 *
 * Specified by https://www.rfc-editor.org/rfc/rfc791.
 */
@friendlyName("IPv4")
@format("ipv4")
@pattern("^(?:(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)\\.){3}(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)$")
@extension("x-nxgt-scalar", "IPv4")
scalar ipV4 extends string;
