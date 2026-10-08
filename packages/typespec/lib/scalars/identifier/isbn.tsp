import "@typespec/openapi";

using TypeSpec.OpenAPI;

namespace Nxgt;

/**
 * An ISBN-10 or an ISBN-13, digits only (no hyphen or space). An ISBN-10 may end
 * in an uppercase `X`; an ISBN-13 starts with 978, or 979 followed by 1 to 9
 * (979-0 is the ISMN). The check digit is not in the pattern.
 *
 * Specified by https://www.isbn-international.org/content/isbn-users-manual/29.
 */
@friendlyName("ISBN")
@format("isbn")
@pattern("^(?:\\d{9}[\\dX]|(?:978\\d|979[1-9])\\d{9})$")
@extension("x-nxgt-scalar", "ISBN")
scalar isbn extends string;
