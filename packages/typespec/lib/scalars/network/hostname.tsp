import "@typespec/openapi";

using TypeSpec.OpenAPI;

namespace Nxgt;

/**
 * A host name, kept as sent: `api.example.com`. Dot-separated labels of
 * letters, digits and hyphens, none starting or ending with a hyphen, each
 * up to 63 characters and 253 in all, with an optional trailing dot. The
 * last label is not a number (all digits, or `0x` and hex digits), so an
 * IPv4 address is not a host name. A single label (`localhost`) and punycode
 * are; a Unicode label is not. Nothing is resolved.
 *
 * Specified by https://www.rfc-editor.org/rfc/rfc1123.
 */
@friendlyName("Hostname")
@format("hostname")
@pattern("^(?=.{1,253}\\.?$)(?!(?:[A-Za-z0-9-]+\\.)*(?:\\d+|0[xX][0-9a-fA-F]*)\\.?$)(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\\.)*[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\\.?$")
@extension("x-nxgt-scalar", "Hostname")
scalar hostname extends string;
