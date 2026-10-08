import "@typespec/openapi";

using TypeSpec.OpenAPI;

namespace Nxgt;

/**
 * An International Bank Account Number in its electronic form, uppercase, no
 * spaces: `FR1420041010050500013M02606`. Two letters, two check digits, then
 * 11 to 30 letters or digits. The checksum (ISO 13616, mod 97) and the
 * country and its length are not in the pattern.
 *
 * Specified by https://www.iso.org/standard/81090.html.
 */
@friendlyName("IBAN")
@format("iban")
@pattern("^[A-Z]{2}\\d{2}[A-Z0-9]{11,30}$")
@extension("x-nxgt-scalar", "IBAN")
scalar iban extends string;
