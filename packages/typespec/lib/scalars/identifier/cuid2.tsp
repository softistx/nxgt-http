import "@typespec/openapi";

using TypeSpec.OpenAPI;

namespace Nxgt;

/**
 * A Cuid2: a lower-case letter, then lower-case letters and digits, 2 to 32
 * characters in all (24 by default).
 *
 * Specified by https://github.com/paralleldrive/cuid2.
 */
@friendlyName("Cuid2")
@format("cuid2")
@pattern("^[a-z][a-z0-9]{1,31}$")
@extension("x-nxgt-scalar", "Cuid2")
scalar cuid2 extends string;
