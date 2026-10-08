import "@typespec/openapi";

using TypeSpec.OpenAPI;

namespace Nxgt;

/**
 * A Nano ID of the default shape: 21 characters of `A-Za-z0-9_-`.
 *
 * Specified by https://github.com/ai/nanoid.
 */
@friendlyName("NanoID")
@format("nano-id")
@pattern("^[A-Za-z0-9_-]{21}$")
@extension("x-nxgt-scalar", "NanoID")
scalar nanoId extends string;
