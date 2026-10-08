import "@typespec/openapi";

using TypeSpec.OpenAPI;

namespace Nxgt;

/**
 * A CSS hex color: `#` then 3, 4, 6 or 8 hexadecimal digits, in any case, kept
 * as sent: `#ff0000`. The 4 and 8 digit forms carry an alpha.
 *
 * Specified by https://www.w3.org/TR/css-color-4/#hex-notation.
 */
@friendlyName("HexColorCode")
@format("hex-color-code")
@pattern("^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$")
@extension("x-nxgt-scalar", "HexColorCode")
scalar hexColorCode extends string;
