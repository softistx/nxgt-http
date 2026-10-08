import "@typespec/openapi";

using TypeSpec.OpenAPI;

namespace Nxgt;

/**
 * A signed JSON Web Token in compact form: three base64url parts joined by `.`.
 * Only the shape is in the pattern: that each part is in its one canonical
 * spelling, that the header and the payload are JSON objects and that the
 * header's `alg` is not `none` are left out, and the signature is not verified.
 *
 * Specified by https://www.rfc-editor.org/rfc/rfc7519.
 */
@friendlyName("JWT")
@format("jwt")
@pattern("^[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+$")
@extension("x-nxgt-scalar", "JWT")
scalar jwt extends string;
