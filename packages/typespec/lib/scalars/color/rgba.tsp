import "@typespec/openapi";

using TypeSpec.OpenAPI;

namespace Nxgt;

/**
 * A CSS `rgba()` color in the comma syntax: `rgba(255, 0, 0, 0.5)`. As `rgb`
 * plus an alpha: `0`, `1`, or a fraction with no trailing zero and a leading
 * `0`.
 *
 * Specified by https://www.w3.org/TR/css-color-4/#rgb-functions.
 */
@friendlyName("RGBA")
@format("rgba")
@pattern("^rgba\\((?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d), (?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d), (?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d), (?:0|1|0\\.\\d*[1-9])\\)$")
@extension("x-nxgt-scalar", "RGBA")
scalar rgba extends string;
