import "@typespec/openapi";

using TypeSpec.OpenAPI;

namespace Nxgt;

/**
 * A CSS `hsla()` color in the comma syntax: `hsla(120, 100%, 50%, 0.5)`. As
 * `hsl` plus an alpha: `0`, `1`, or a fraction with no trailing zero and a
 * leading `0`.
 *
 * Specified by https://www.w3.org/TR/css-color-4/#the-hsl-notation.
 */
@friendlyName("HSLA")
@format("hsla")
@pattern("^hsla\\((?:3[0-5]\\d|[12]\\d\\d|[1-9]?\\d), (?:100|[1-9]?\\d)%, (?:100|[1-9]?\\d)%, (?:0|1|0\\.\\d*[1-9])\\)$")
@extension("x-nxgt-scalar", "HSLA")
scalar hsla extends string;
