import "@typespec/openapi";

using TypeSpec.OpenAPI;

namespace Nxgt;

/**
 * A CSS `hsl()` color in the comma syntax: `hsl(120, 100%, 50%)`. A hue from 0
 * to 359 with no unit (360 is written 0), then saturation and lightness as
 * integer percentages from 0% to 100%.
 *
 * Specified by https://www.w3.org/TR/css-color-4/#the-hsl-notation.
 */
@friendlyName("HSL")
@format("hsl")
@pattern("^hsl\\((?:3[0-5]\\d|[12]\\d\\d|[1-9]?\\d), (?:100|[1-9]?\\d)%, (?:100|[1-9]?\\d)%\\)$")
@extension("x-nxgt-scalar", "HSL")
scalar hsl extends string;
