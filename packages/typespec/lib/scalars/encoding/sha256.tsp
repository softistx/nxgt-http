import "@typespec/openapi";

using TypeSpec.OpenAPI;

namespace Nxgt;

/**
 * A SHA-256 digest: 64 hexadecimal digits, in any case, kept as sent.
 *
 * Specified by https://csrc.nist.gov/pubs/fips/180-4/upd1/final.
 */
@friendlyName("SHA256")
@format("sha256")
@pattern("^[0-9a-fA-F]{64}$")
@extension("x-nxgt-scalar", "SHA256")
scalar sha256 extends string;
