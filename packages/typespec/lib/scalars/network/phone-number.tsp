import "@typespec/openapi";

using TypeSpec.OpenAPI;

namespace Nxgt;

/**
 * A phone number in E.164 form: `+`, a country code that does not start with
 * 0, and 7 to 15 digits in all, with no space or separator: `+33612345678`.
 * Only the shape is checked.
 *
 * Specified by https://www.itu.int/rec/T-REC-E.164.
 */
@friendlyName("PhoneNumber")
@format("phone-number")
@pattern("^\\+[1-9]\\d{6,14}$")
@extension("x-nxgt-scalar", "PhoneNumber")
scalar phoneNumber extends string;
