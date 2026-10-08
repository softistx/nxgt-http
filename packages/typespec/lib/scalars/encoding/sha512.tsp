import "@typespec/openapi";

using TypeSpec.OpenAPI;

namespace Nxgt;

/**
 * A SHA-512 digest: 128 hexadecimal digits, in any case, kept as sent.
 *
 * Specified by https://csrc.nist.gov/pubs/fips/180-4/upd1/final.
 */
@friendlyName("SHA512")
@format("sha512")
@pattern("^[0-9a-fA-F]{128}$")
@extension("x-nxgt-scalar", "SHA512")
scalar sha512 extends string;
