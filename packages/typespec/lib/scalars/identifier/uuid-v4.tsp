import "@typespec/openapi";

using TypeSpec.OpenAPI;

namespace Nxgt;

/**
 * A version 4 (random) UUID with the RFC variant, in any case, kept as sent.
 *
 * Specified by https://www.rfc-editor.org/rfc/rfc9562.
 */
@friendlyName("UUIDv4")
@format("uuid")
@pattern("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$")
@extension("x-nxgt-scalar", "UUIDv4")
scalar uuidV4 extends string;
