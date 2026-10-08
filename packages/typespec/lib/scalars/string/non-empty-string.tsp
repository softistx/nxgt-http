import "@typespec/openapi";

using TypeSpec.OpenAPI;

namespace Nxgt;

/**
 * A string with at least one non-white-space character, kept as sent, not
 * trimmed. "White space" is ECMAScript's `\s`.
 */
@friendlyName("NonEmptyString")
@format("non-empty-string")
@pattern("^\\s*\\S[\\s\\S]*$")
@extension("x-nxgt-scalar", "NonEmptyString")
scalar nonEmptyString extends string;
