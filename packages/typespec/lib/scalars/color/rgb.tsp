import "@typespec/openapi";

using TypeSpec.OpenAPI;

namespace Nxgt;

/**
 * A CSS `rgb()` color in the comma syntax: `rgb(255, 0, 0)`. Three integers
 * from 0 to 255, no leading zero, no percentage, a `, ` between them, the
 * function name in lower case.
 *
 * Specified by https://www.w3.org/TR/css-color-4/#rgb-functions.
 */
@friendlyName("RGB")
@format("rgb")
@pattern("^rgb\\((?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d), (?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d), (?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)\\)$")
@extension("x-nxgt-scalar", "RGB")
scalar rgb extends string;
