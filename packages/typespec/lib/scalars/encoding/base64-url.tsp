import "@typespec/openapi";

using TypeSpec.OpenAPI;

namespace Nxgt;

/**
 * URL-safe base64 (RFC 4648, section 5): `-` and `_`, no padding, in its one
 * canonical spelling. The empty string is the encoding of no bytes.
 *
 * Specified by https://www.rfc-editor.org/rfc/rfc4648#section-5.
 */
@friendlyName("Base64URL")
@format("base64-url")
@pattern("^(?:[A-Za-z0-9_-]{4})*(?:[A-Za-z0-9_-][AQgw]|[A-Za-z0-9_-]{2}[AEIMQUYcgkosw048])?$")
@extension("x-nxgt-scalar", "Base64URL")
scalar base64Url extends string;
