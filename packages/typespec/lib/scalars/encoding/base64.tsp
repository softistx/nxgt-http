import "@typespec/openapi";

using TypeSpec.OpenAPI;

namespace Nxgt;

/**
 * Standard base64 (RFC 4648, section 4) with its padding, in its one canonical
 * spelling: `YR==` decodes to the same byte as `YQ==` and is not taken. The
 * empty string is the encoding of no bytes.
 *
 * Specified by https://www.rfc-editor.org/rfc/rfc4648#section-4.
 */
@friendlyName("Base64")
@format("byte")
@pattern("^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/][AQgw]==|[A-Za-z0-9+/]{2}[AEIMQUYcgkosw048]=)?$")
@extension("x-nxgt-scalar", "Base64")
scalar base64 extends string;
