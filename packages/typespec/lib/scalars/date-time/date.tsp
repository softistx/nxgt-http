import "@typespec/openapi";

using TypeSpec.OpenAPI;

namespace Nxgt;

/**
 * A calendar date, `YYYY-MM-DD`, with no time and no time zone: `2024-02-29`. An impossible
 * day, such as `2023-02-29`, is refused.
 *
 * Specified by https://www.rfc-editor.org/rfc/rfc3339#section-5.6.
 */
@friendlyName("Date")
@format("date")
@pattern("^(?:\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|02-(?:0[1-9]|1\\d|2[0-8]))|(?:\\d\\d(?:0[48]|[2468][048]|[13579][26])|(?:[02468][048]|[13579][26])00)-02-29)$")
@extension("x-nxgt-scalar", "Date")
scalar date extends string;
