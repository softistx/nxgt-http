import "@typespec/openapi";

using TypeSpec.OpenAPI;

namespace Nxgt;

/**
 * A version 7 (time-ordered) UUID with the RFC variant, in any case, kept as sent.
 *
 * Specified by https://www.rfc-editor.org/rfc/rfc9562.
 */
@friendlyName("UUIDv7")
@format("uuid")
@pattern("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-7[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$")
@extension("x-nxgt-scalar", "UUIDv7")
scalar uuidV7 extends string;
