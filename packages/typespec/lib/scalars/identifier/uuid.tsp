import "@typespec/openapi";

using TypeSpec.OpenAPI;

namespace Nxgt;

// The id @nxgt/drizzle's id() and actors() columns hold by default.
/**
 * An RFC 9562 UUID, any version 1 to 8 with the RFC variant, or the nil or
 * the max UUID, in any case, kept as sent: `0b8e5c1e-2f4a-4c3b-9d6e-7f8a9b0c1d2e`.
 *
 * Specified by https://www.rfc-editor.org/rfc/rfc9562.
 */
@friendlyName("UUID")
@format("uuid")
@pattern("^(?:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|0{8}-0{4}-0{4}-0{4}-0{12}|[fF]{8}-[fF]{4}-[fF]{4}-[fF]{4}-[fF]{12})$")
@extension("x-nxgt-scalar", "UUID")
scalar uuid extends string;
