import "@typespec/openapi";

using TypeSpec.OpenAPI;

namespace Nxgt;

/**
 * One emoji: `😀`, `👍🏽`, `👨‍👩‍👧`, `🇫🇷`, `1️⃣`. A pictograph with an optional variation
 * selector or skin tone, joined to others by zero-width joiners; a
 * pair of regional indicators (a flag); or a keycap. The pattern is an
 * approximation by Unicode properties, so it needs the `u` flag; it does not
 * segment user-perceived characters, takes no tag sequence (the flags of England,
 * Scotland and Wales) and has no 32 code points limit.
 *
 * Specified by https://www.unicode.org/reports/tr51/.
 */
@friendlyName("Emoji")
@format("emoji")
@pattern("^(?:\\p{Regional_Indicator}{2}|[#*0-9]\\uFE0F?\\u20E3|\\p{Extended_Pictographic}(?:\\uFE0F|\\p{Emoji_Modifier})?(?:\\u200D\\p{Extended_Pictographic}(?:\\uFE0F|\\p{Emoji_Modifier})?)*)$")
@extension("x-nxgt-scalar", "Emoji")
scalar emoji extends string;
