import "@typespec/openapi";

using TypeSpec.OpenAPI;

namespace Nxgt;

/**
 * An RFC 3339 date-time with its offset, `Z` or `±hh:mm`, kept as sent: `2024-03-10T12:00:00+02:00`.
 * A time with no offset names no instant and is refused, and so is the offset `-00:00`:
 * write `Z` or `+00:00`. An impossible day is refused. The range 0000 to 9999 in UTC is
 * not in the pattern, nor is the leap second.
 *
 * Specified by https://www.rfc-editor.org/rfc/rfc3339.
 */
@friendlyName("DateTime")
@format("date-time")
@pattern("^(?:\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|02-(?:0[1-9]|1\\d|2[0-8]))|(?:\\d\\d(?:0[48]|[2468][048]|[13579][26])|(?:[02468][048]|[13579][26])00)-02-29)T(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)(?:Z|\\+(?:[01]\\d|2[0-3]):[0-5]\\d|-(?!00:00)(?:[01]\\d|2[0-3]):[0-5]\\d)$")
@extension("x-nxgt-scalar", "DateTime")
scalar dateTime extends string;
