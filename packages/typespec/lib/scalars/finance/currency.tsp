import "@typespec/openapi";

using TypeSpec.OpenAPI;

namespace Nxgt;

/**
 * An ISO 4217 currency code, uppercase: `EUR`, `USD`. The list of codes in
 * force is not in the pattern: only the shape is.
 *
 * Specified by https://www.iso.org/iso-4217-currency-codes.html.
 */
@friendlyName("Currency")
@format("currency")
@pattern("^[A-Z]{3}$")
@extension("x-nxgt-scalar", "Currency")
scalar currency extends string;
